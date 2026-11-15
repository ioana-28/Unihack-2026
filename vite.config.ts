import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/** Receives tagged browser logs and prints them in the terminal running Vite. */
function browserLogRelay(): Plugin {
  const handler = (
    req: { method?: string; on: (event: string, callback: (chunk: { toString(): string }) => void) => void },
    res: { statusCode: number; end: () => void },
  ): void => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const { line } = JSON.parse(body) as { line?: unknown }
        if (typeof line === 'string') console.log(`[phone] ${line}`)
      } catch {
        // Ignore malformed payloads.
      }
      res.statusCode = 204
      res.end()
    })
  }

  return {
    name: 'browser-log-relay',
    configureServer(server) {
      server.middlewares.use('/__log', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__log', handler)
    },
  }
}

export default defineConfig({
  plugins: [browserLogRelay()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  build: { target: 'es2022' },
})
