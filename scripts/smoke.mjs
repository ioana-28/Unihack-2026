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
      'lobby is the initial mode',
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
      'keyboard reaches the entry control',
      await evaluate(cdp, "document.activeElement?.id === 'enter'"),
    )
    check(
      'entry control shows a focus ring',
      await evaluate(
        cdp,
        "(() => { const style = getComputedStyle(document.querySelector('#enter')); return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 })()",
      ),
    )

    await sleep(600)
    const lobbyShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(ARTIFACTS, 'lobby.png'), Buffer.from(lobbyShot.data, 'base64'))

    check(
      'only one entry control is offered',
      await evaluate(
        cdp,
        "(() => { const ghost = document.querySelector('#desktop'); return ghost.hidden === true && getComputedStyle(ghost).display === 'none' && document.querySelectorAll('.actions .btn:not([hidden])').length === 2 })()",
      ),
    )
    check(
      'desktop mode hides the lobby and shows exit',
      await evaluate(
        cdp,
        "(() => { const ghost = document.querySelector('#desktop'); const entry = ghost.hidden ? document.querySelector('#enter') : ghost; entry.click(); return document.body.dataset.mode === 'desktop' && document.querySelector('#exit').hidden === false && getComputedStyle(document.querySelector('#lobby')).display === 'none' })()",
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
