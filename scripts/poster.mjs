import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'

const PORT = Number(process.env.POSTER_PORT ?? 4184)
const DEBUG_PORT = Number(process.env.POSTER_DEBUG_PORT ?? 9444)
const MEDIA = resolve('public/media')
const ARTIFACTS = resolve('.artifacts')
const CUTS = join(ARTIFACTS, 'cuts')
const POSTER_TIME = 6.4
const CUT_TIMES = (process.env.POSTER_CUTS ?? '0,2,4,6,8')
  .split(',')
  .map(Number)
  .filter((value) => Number.isFinite(value))
const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function waitFor(fn, label, timeout = 20000, interval = 200) {
  const started = Date.now()
  for (;;) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`)
    await sleep(interval)
  }
}

function startServer() {
  const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#080706;overflow:hidden}
video{display:block;width:100vw;height:100vh;object-fit:cover}
</style></head>
<body><video id="v" src="/video_intro.mp4" muted playsinline preload="auto"></video></body>
</html>`
  return createServer((request, response) => {
    if (request.url === '/' || request.url === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(page)
      return
    }
    const name = decodeURIComponent((request.url ?? '').split('?')[0])
    const file = join(MEDIA, name.replace(/^\/+/, ''))
    if (!file.startsWith(MEDIA) || !existsSync(file)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const size = statSync(file).size
    const range = request.headers.range
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      const start = match?.[1] ? Number(match[1]) : 0
      const end = match?.[2] ? Number(match[2]) : size - 1
      if (!match || start >= size || start > end) {
        response.writeHead(416, { 'content-range': `bytes */${size}` })
        response.end()
        return
      }
      response.writeHead(206, {
        'content-type': mediaType(file),
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
      })
      createReadStream(file, { start, end }).pipe(response)
      return
    }
    response.writeHead(200, {
      'content-type': mediaType(file),
      'accept-ranges': 'bytes',
      'content-length': size,
    })
    createReadStream(file).pipe(response)
  })
}

function mediaType(file) {
  switch (extname(file).toLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

function startBrowser(profile) {
  const executable = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!executable) throw new Error('No Chrome or Edge executable found. Set BROWSER_PATH.')
  return spawn(
    executable,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,720',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${PORT}/`,
    ],
    { stdio: 'ignore' },
  )
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else done(message.result)
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

async function seek(cdp, time) {
  const result = await evaluate(
    cdp,
    `(async () => {
      const video = document.querySelector('#v')
      if (video.readyState < 2) await new Promise((done) => video.addEventListener('loadeddata', done, { once: true }))
      video.pause()
      await new Promise((done) => {
        if (Math.abs(video.currentTime - ${time}) < 0.01) return done()
        video.addEventListener('seeked', done, { once: true })
        video.currentTime = ${time}
      })
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      return { time: video.currentTime, duration: video.duration, width: video.videoWidth, height: video.videoHeight }
    })()`,
  )
  return result
}

async function capture(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 })
  await writeFile(file, Buffer.from(shot.data, 'base64'))
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true })
  await mkdir(CUTS, { recursive: true })
  await mkdir(join(MEDIA), { recursive: true })
  const server = startServer()
  await new Promise((done) => server.listen(PORT, '127.0.0.1', done))
  const profile = join(tmpdir(), `apartamentul-poster-${Date.now()}`)
  let browser
  let cdp
  try {
    browser = startBrowser(profile)
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      const targets = await response.json()
      return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
    }, 'browser target')
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
    await waitFor(
      async () => (await evaluate(cdp, 'document.readyState')) === 'complete',
      'capture page',
    )
    const meta = await seek(cdp, POSTER_TIME)
    console.log(
      `video ${meta.width}x${meta.height}, duration ${Number(meta.duration).toFixed(2)}s`,
    )
    await capture(cdp, join(MEDIA, 'prologue-poster.jpg'))
    console.log('poster public/media/prologue-poster.jpg')
    for (const time of CUT_TIMES) {
      const frame = await seek(cdp, time)
      const file = join(CUTS, `cut-${time}.jpg`)
      await capture(cdp, file)
      console.log(`cut ${time}s -> ${file} (decoded ${Number(frame.time).toFixed(2)}s)`)
    }
  } finally {
    cdp?.close()
    browser?.kill()
    await new Promise((done) => server.close(done))
  }
}

await main()
