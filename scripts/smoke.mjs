import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 4174)
const DEBUG_PORT = Number(process.env.SMOKE_DEBUG_PORT ?? 9333)
const URL = `http://127.0.0.1:${PORT}/`
const ARTIFACTS = resolve('.artifacts')
const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function waitFor(fn, label, timeout = 20000, interval = 250) {
  const started = Date.now()
  for (;;) {
    try {
      const value = await fn()
      if (value) return value
    } catch {
      // retry until the timeout, the target may not be up yet
    }
    if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`)
    await sleep(interval)
  }
}

function startPreview() {
  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' },
  )
  return child
}

function startBrowser(profile) {
  const executable = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!executable) throw new Error('No Chrome or Edge executable found. Set BROWSER_PATH.')
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=1440,900',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      URL,
    ],
    { stdio: 'ignore' },
  )
  return child
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.errors = []
    this.warnings = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else done(message.result)
        return
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails
        this.errors.push(detail.exception?.description ?? detail.text)
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
        this.warnings.push(
          message.params.args.map((arg) => arg.value ?? arg.description).join(' '),
        )
      }
    })
  }

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((done, fail) => {
      socket.addEventListener('open', done, { once: true })
      socket.addEventListener('error', fail, { once: true })
    })
    return new Cdp(socket)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((done, fail) => {
      this.pending.set(id, { resolve: done, reject: fail })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? 'evaluate failed')
  }
  return response.result.value
}

async function shot(cdp, name) {
  await sleep(250)
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(ARTIFACTS, name), Buffer.from(image.data, 'base64'))
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true })
  const preview = startPreview()
  const profile = join(tmpdir(), `apartamentul-smoke-${Date.now()}`)
  let browser
  let cdp
  const failures = []
  const passes = []

  const check = (name, ok) => {
    if (ok) passes.push(name)
    else failures.push(name)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  }

  try {
    await waitFor(async () => (await fetch(URL)).ok, 'preview server')

    browser = startBrowser(profile)
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      const targets = await response.json()
      return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
    }, 'browser target')

    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.navigate', { url: URL })

    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'document ready',
    )
    await waitFor(
      async () =>
        (await evaluate(cdp, "document.querySelector('#status-text')?.textContent ?? ''")) !==
        'Se verifică…',
      'xr detection',
    )

    check(
      'prologue is the initial view',
      await evaluate(
        cdp,
        "document.body.dataset.view === 'prologue' && getComputedStyle(document.querySelector('#prologue')).display !== 'none' && getComputedStyle(document.querySelector('#lobby')).display === 'none'",
      ),
    )
    check(
      'prologue carries the title and dateline',
      await evaluate(
        cdp,
        "document.querySelector('#prologue h1')?.textContent?.trim() === 'Apartamentul' && document.querySelector('.prologue__dateline')?.textContent?.includes('15 decembrie 1989')",
      ),
    )
    check(
      'five beats carry the film times',
      await evaluate(
        cdp,
        "(() => { const beats = [...document.querySelectorAll('.prologue__beat')]; return beats.length === 5 && beats.map((beat) => beat.dataset.time).join(',') === '0,2,4,6,8.3' })()",
      ),
    )
    check(
      'dossier names Radu and stamps fiction',
      await evaluate(
        cdp,
        "(() => { const text = document.querySelector('#prologue-dossier').textContent; return text.includes('Dosar personal') && text.includes('Radu Petrescu') && text.includes('ELBA') && text.includes('Ficțiune') })()",
      ),
    )
    check(
      'week lists eight days with the 15th current',
      await evaluate(
        cdp,
        "(() => { const days = [...document.querySelectorAll('.prologue__day')]; return days.length === 8 && days[0].classList.contains('is-current') && days[0].textContent.includes('15') && days[1].classList.contains('is-marked') })()",
      ),
    )
    check(
      'CTA opens the apartment',
      await evaluate(
        cdp,
        "(() => { const button = document.querySelector('#prologue-cta'); return button.textContent.includes('Deschide fereastra') && button.textContent.includes('Prologul se închide') })()",
      ),
    )
    check(
      'video is present, muted, and not looping',
      await evaluate(
        cdp,
        "(() => { const video = document.querySelector('#prologue-video'); return video instanceof HTMLVideoElement && video.muted === true && video.loop === false && video.getAttribute('src') === '/media/prologue.mp4' && video.getAttribute('poster') === '/media/prologue-poster.jpg' })()",
      ),
    )

    await sleep(800)
    check(
      'prologue video plays muted',
      await evaluate(
        cdp,
        "(() => { const video = document.querySelector('#prologue-video'); return video.paused === false && video.currentTime >= 0 })()",
      ),
    )

    await shot(cdp, 'prologue.png')

    await evaluate(
      cdp,
      "document.querySelectorAll('.prologue__beat')[2].scrollIntoView({ block: 'center' })",
    )
    await sleep(600)
    const beatState = await evaluate(
      cdp,
      "(() => { const beat = document.querySelectorAll('.prologue__beat')[2]; const video = document.querySelector('#prologue-video'); return { active: beat.classList.contains('is-active'), time: Number(beat.dataset.time), current: video.currentTime } })()",
    )
    check(
      'a visible beat seeks the film',
      beatState.active &&
        beatState.current >= beatState.time - 0.1 &&
        beatState.current <= beatState.time + 1.2,
    )
    await shot(cdp, 'prologue-beats.png')

    await evaluate(
      cdp,
      "document.querySelector('#prologue-dossier').scrollIntoView({ block: 'center' })",
    )
    await shot(cdp, 'prologue-dossier.png')

    await evaluate(cdp, "window.scrollTo({ top: 0, behavior: 'auto' })")
    await sleep(250)

    check(
      'sound toggle unmutes and relabels',
      await evaluate(
        cdp,
        "(() => { const button = document.querySelector('#prologue-sound'); button.click(); const video = document.querySelector('#prologue-video'); return video.muted === false && button.getAttribute('aria-pressed') === 'true' && button.textContent.trim() === 'Fără sunet' })()",
      ),
    )
    check(
      'sound toggle restores the mute',
      await evaluate(
        cdp,
        "(() => { const button = document.querySelector('#prologue-sound'); button.click(); const video = document.querySelector('#prologue-video'); return video.muted === true && button.getAttribute('aria-pressed') === 'false' && button.textContent.trim() === 'Sunet' })()",
      ),
    )

    check(
      'CTA opens the entry view',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#prologue-cta').click(); return document.body.dataset.view === 'entry' && getComputedStyle(document.querySelector('#lobby')).display !== 'none' && document.querySelector('#prologue').inert === true && document.querySelector('#lobby').inert === false })()",
      ),
    )
    check(
      'entry focuses the apartment action',
      await evaluate(cdp, "document.activeElement?.id === 'enter'"),
    )
    check(
      'entry pauses the film',
      await evaluate(cdp, "document.querySelector('#prologue-video').paused === true"),
    )
    await sleep(700)
    check(
      'entry hides the prologue after the fade',
      await evaluate(cdp, "document.querySelector('#prologue').hidden === true"),
    )
    await shot(cdp, 'entry.png')

    check(
      'entry shows the lobby',
      await evaluate(
        cdp,
        "document.body.dataset.mode === 'lobby' && getComputedStyle(document.querySelector('#lobby')).display !== 'none'",
      ),
    )
    check(
      'status line resolved to a real value',
      await evaluate(
        cdp,
        "(() => { const text = document.querySelector('#status-text').textContent; return text.length > 0 && !text.includes('Se verifică') })()",
      ),
    )
    check(
      'canvas has a drawn size',
      await evaluate(
        cdp,
        "(() => { const canvas = document.querySelector('#stage'); return canvas.width > 0 && canvas.height > 0 })()",
      ),
    )
    check(
      'canvas has no inline size',
      await evaluate(cdp, "document.querySelector('#stage').getAttribute('style') === null"),
    )
    check(
      'canvas fills the viewport',
      await evaluate(
        cdp,
        "(() => { const rect = document.querySelector('#stage').getBoundingClientRect(); return Math.abs(rect.width - window.innerWidth) < 1 && Math.abs(rect.height - window.innerHeight) < 1 })()",
      ),
    )

    check(
      'howto starts collapsed',
      await evaluate(cdp, "document.querySelector('#howto').hidden === true"),
    )
    check(
      'howto button expands the panel',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#howto-toggle').click(); return document.querySelector('#howto').hidden === false && document.querySelector('#howto-toggle').getAttribute('aria-expanded') === 'true' })()",
      ),
    )

    await sleep(300)
    const howtoShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(ARTIFACTS, 'howto.png'), Buffer.from(howtoShot.data, 'base64'))

    check(
      'howto button collapses the panel',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#howto-toggle').click(); return document.querySelector('#howto').hidden === true && document.querySelector('#howto-toggle').getAttribute('aria-expanded') === 'false' })()",
      ),
    )

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    })
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    })
    check(
      'keyboard reaches an action',
      await evaluate(
        cdp,
        "['enter', 'howto-toggle', 'desktop'].includes(document.activeElement?.id)",
      ),
    )
    check(
      'focused action shows a focus ring',
      await evaluate(
        cdp,
        "(() => { const style = getComputedStyle(document.activeElement); return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 })()",
      ),
    )

    await sleep(600)
    const lobbyShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(ARTIFACTS, 'lobby.png'), Buffer.from(lobbyShot.data, 'base64'))

    check(
      'VR entry is available and desktop stays reachable',
      await evaluate(
        cdp,
        "(() => { const ghost = document.querySelector('#desktop'); return document.querySelector('#enter').disabled === false && ghost.hidden === false && getComputedStyle(ghost).display !== 'none' })()",
      ),
    )

    check(
      'cardboard mode starts from the primary action',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#enter').click(); return document.body.dataset.mode === 'cardboard' && getComputedStyle(document.querySelector('#lobby')).display === 'none' })()",
      ),
    )

    await sleep(700)
    const cardboardShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(ARTIFACTS, 'cardboard.png'), Buffer.from(cardboardShot.data, 'base64'))

    check(
      'cardboard keeps the stereo frame',
      await evaluate(cdp, "document.body.dataset.mode === 'cardboard'"),
    )
    check(
      'cardboard starts the prologue film',
      await evaluate(
        cdp,
        "(() => { const video = document.querySelector('#prologue-video'); return video.currentTime > 0 && video.paused === false })()",
      ),
    )

    await sleep(11500)
    const cardboardRoomShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(
      join(ARTIFACTS, 'cardboard-room.png'),
      Buffer.from(cardboardRoomShot.data, 'base64'),
    )
    check(
      'cardboard ends the prologue film',
      await evaluate(cdp, "document.querySelector('#prologue-video').ended === true"),
    )
    check(
      'escape leaves cardboard',
      await evaluate(
        cdp,
        "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); return document.body.dataset.mode === 'lobby' && document.querySelector('#exit').hidden === true })()",
      ),
    )

    check(
      'desktop mode hides the lobby and shows exit',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#desktop').click(); return document.body.dataset.mode === 'desktop' && document.querySelector('#exit').hidden === false && getComputedStyle(document.querySelector('#lobby')).display === 'none' })()",
      ),
    )

    await sleep(400)
    const desktopShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(ARTIFACTS, 'desktop.png'), Buffer.from(desktopShot.data, 'base64'))

    check(
      'escape returns to the lobby',
      await evaluate(
        cdp,
        "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); return document.body.dataset.mode === 'lobby' && document.querySelector('#exit').hidden === true })()",
      ),
    )

    check(
      'replay returns to the prologue',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#prologue-replay').click(); return document.body.dataset.view === 'prologue' && document.querySelector('#prologue').hidden === false && getComputedStyle(document.querySelector('#lobby')).display === 'none' && document.activeElement?.id === 'prologue' })()",
      ),
    )
    await sleep(400)
    check(
      'replay restarts the film',
      await evaluate(
        cdp,
        "(() => { const video = document.querySelector('#prologue-video'); return video.paused === false && video.currentTime >= 0 && video.currentTime < 1.5 })()",
      ),
    )
    check(
      'skip returns to the entry',
      await evaluate(
        cdp,
        "(() => { document.querySelector('#prologue-skip').click(); return document.body.dataset.view === 'entry' && document.querySelector('#lobby').inert === false && document.querySelector('#prologue').inert === true && document.activeElement?.id === 'enter' })()",
      ),
    )
    await sleep(700)

    await cdp.send('Page.navigate', { url: `${URL}?view=entry` })
    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'entry deep link ready',
    )
    await waitFor(
      async () => (await evaluate(cdp, "document.body.dataset.view")) === 'entry',
      'entry deep link applies the view',
    )
    await sleep(700)
    check(
      '?view=entry opens the lobby',
      await evaluate(
        cdp,
        "document.body.dataset.view === 'entry' && document.body.dataset.mode === 'lobby' && document.querySelector('#prologue').hidden === true && getComputedStyle(document.querySelector('#lobby')).display !== 'none'",
      ),
    )
    check(
      '?view=entry keeps the film paused',
      await evaluate(cdp, "document.querySelector('#prologue-video').paused === true"),
    )

    await cdp.send('Page.navigate', { url: `${URL}?mode=desktop` })
    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'deep link ready',
    )
    await waitFor(
      async () => (await evaluate(cdp, "document.body.dataset.mode")) === 'desktop',
      'deep link applies desktop mode',
    )
    check(
      'deep link opens desktop mode',
      await evaluate(
        cdp,
        "document.body.dataset.mode === 'desktop' && document.querySelector('#exit').hidden === false",
      ),
    )

    await sleep(500)
    check(
      'deep link frame renders',
      await evaluate(
        cdp,
        "(() => { const canvas = document.querySelector('#stage'); return canvas.width > 0 && canvas.height > 0 })()",
      ),
    )

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await cdp.send('Page.navigate', { url: URL })
    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'reduced motion ready',
    )
    await waitFor(
      async () => (await evaluate(cdp, "document.body.dataset.view")) === 'prologue',
      'reduced motion applies the prologue',
    )
    await sleep(500)
    check(
      'reduced motion holds the still frame',
      await evaluate(
        cdp,
        "(() => { const video = document.querySelector('#prologue-video'); return document.body.dataset.view === 'prologue' && video.paused === true && getComputedStyle(video).display === 'none' && getComputedStyle(document.querySelector('#prologue-still')).display !== 'none' })()",
      ),
    )
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await cdp.send('Page.navigate', { url: URL })
    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'mobile layout ready',
    )
    await waitFor(
      async () => (await evaluate(cdp, "document.body.dataset.view")) === 'prologue',
      'mobile layout applies the prologue',
    )
    await sleep(500)
    check(
      'mobile prologue fits the viewport',
      await evaluate(
        cdp,
        "(() => { const stage = document.querySelector('.prologue__stage').getBoundingClientRect(); return document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1 && stage.width <= window.innerWidth })()",
      ),
    )
    await shot(cdp, 'prologue-390.png')
    await cdp.send('Emulation.clearDeviceMetricsOverride')

    check('no uncaught runtime errors', cdp.errors.length === 0)
    if (cdp.errors.length > 0) {
      for (const error of cdp.errors) console.log(`  error: ${error}`)
    }

    check('no console warnings', cdp.warnings.length === 0)
    if (cdp.warnings.length > 0) {
      for (const warning of cdp.warnings) console.log(`  warning: ${warning}`)
    }
  } finally {
    cdp?.close()
    browser?.kill()
    preview.kill()
  }

  console.log(`\n${passes.length} passed, ${failures.length} failed`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
