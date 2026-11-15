const TAGS = ['[ana]', '[z17]', '[day]', '[audio]', '[media]']
const MAX_LINES = 24

type Subscriber = (line: string) => void

const subscribers: Subscriber[] = []
let patched = false

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function notify(line: string): void {
  for (const subscriber of subscribers) subscriber(line)
}

function patchConsole(): void {
  if (patched) return
  patched = true

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      const text = args.map(stringify).join(' ')
      if (TAGS.some((tag) => text.includes(tag))) notify(`${level}: ${text}`)
    }
  }

  window.addEventListener('error', (event) => notify(`error: ${event.message}`))
  window.addEventListener('unhandledrejection', (event) =>
    notify(`rejection: ${stringify(event.reason)}`),
  )
}

export function onLog(subscriber: Subscriber): void {
  patchConsole()
  subscribers.push(subscriber)
}

/** Sends tagged console lines to the Vite server, which prints them in the terminal. */
export function installLogRelay(): void {
  onLog((line) => {
    const body = JSON.stringify({ line })
    void fetch('/__log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  })
}

/** On-screen log panel, enabled with ?logs in the URL. */
export function installLogPanel(): void {
  const panel = document.createElement('pre')
  panel.id = 'debug-logs'
  Object.assign(panel.style, {
    position: 'fixed',
    left: '8px',
    top: '8px',
    right: '8px',
    maxHeight: '55vh',
    overflow: 'auto',
    margin: '0',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.82)',
    color: '#d8e6ff',
    font: '13px/1.4 ui-monospace, Consolas, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    zIndex: '9999',
    pointerEvents: 'auto',
    borderRadius: '8px',
  })
  panel.textContent = 'logs: waiting for [ana] / [z17] messages…'
  document.body.append(panel)

  const lines: string[] = []
  onLog((line) => {
    lines.push(line)
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
    panel.textContent = lines.join('\n')
    panel.scrollTop = panel.scrollHeight
  })
}
