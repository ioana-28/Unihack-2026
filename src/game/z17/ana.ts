import * as THREE from 'three'
import { Conversation } from '@elevenlabs/client'
import type { ActionContext } from '../runner'
import { AGENT_ID, PROMPT_BAZA, PROMPT_Z17 } from './ana-config'
import { darkPeephole, loadLoopVideo, Peephole } from './shared'

// Step 17.2 — live conversation with Doamna Ana through the peephole
// (state machine §5: A_CONECTARE → A_ACTIV | A_REZERVA → A_SFARSIT).

export type AnaOptions = {
  asculta: string
  vorbeste: string
  primaReplica: string
  rezerva: { src: string; subtitrare: string }
  maxSecunde: number
  privireInAfara: number
}

const MIC_TIMEOUT_MS = 8000
const CONNECT_TIMEOUT_MS = 15000
const EARLY_FAILURE_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ])
}

/** Small microphone icon above the view center while the session is live. */
function micIcon(ctx: ActionContext): () => void {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const c = canvas.getContext('2d')
  if (c) {
    c.fillStyle = 'rgba(9, 9, 8, 0.75)'
    c.beginPath()
    c.arc(64, 64, 60, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#ff5a4f'
    c.beginPath()
    c.roundRect(48, 22, 32, 56, 16)
    c.fill()
    c.strokeStyle = '#ff5a4f'
    c.lineWidth = 7
    c.beginPath()
    c.arc(64, 62, 28, 0.15 * Math.PI, 0.85 * Math.PI)
    c.stroke()
    c.beginPath()
    c.moveTo(64, 92)
    c.lineTo(64, 108)
    c.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  )
  mesh.renderOrder = 97
  mesh.position.set(0.62, 0.42, 0)
  ctx.deps.overlay.root.add(mesh)
  return () => {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    mesh.material.dispose()
    texture.dispose()
  }
}

/** Reading time for a subtitle: long enough to read, never a flash. */
function readingSeconds(text: string): number {
  return Math.max(4, 2 + text.split(/\s+/).length * 0.45)
}

/** What the player says, shown instantly in its own line above Ana's subtitle. */
function playerLine(ctx: ActionContext): { show: (text: string) => void; remove: () => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 200
  const c = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, (1.5 * 200) / 1536),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  )
  mesh.renderOrder = 97
  mesh.position.set(0, -0.33, 0)
  mesh.visible = false
  ctx.deps.overlay.root.add(mesh)
  let hideTimer = 0
  return {
    show: (text) => {
      if (!c || !text.trim()) return
      c.clearRect(0, 0, canvas.width, canvas.height)
      c.font = 'italic 500 50px system-ui, "Segoe UI", sans-serif'
      let shown = text.trim()
      // Keep the end of long sentences: that is what is being said right now.
      while (c.measureText(shown).width > canvas.width - 140 && shown.length > 10) shown = `…${shown.slice(2)}`
      const width = Math.min(canvas.width - 20, c.measureText(shown).width + 90)
      c.fillStyle = 'rgba(12, 18, 30, 0.6)'
      c.beginPath()
      c.roundRect((canvas.width - width) / 2, 30, width, 140, 22)
      c.fill()
      c.fillStyle = '#cfe0ff'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(shown, canvas.width / 2, 100)
      texture.needsUpdate = true
      mesh.visible = true
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        mesh.visible = false
      }, readingSeconds(text) * 1000)
    },
    remove: () => {
      window.clearTimeout(hideTimer)
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
      texture.dispose()
    },
  }
}

async function microphoneAllowed(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), MIC_TIMEOUT_MS, 'microphone')
    for (const track of stream.getTracks()) track.stop()
    return true
  } catch (error) {
    console.warn('[ana] Microphone not available; using the fallback line.', error)
    return false
  }
}

export async function runAna(ctx: ActionContext, options: AnaOptions): Promise<void> {
  const { overlay } = ctx.deps
  console.info(
    '[ana] start',
    `agent=${AGENT_ID}`,
    `opener=${options.primaReplica ? 'yes' : 'no'}`,
    `listening=${options.asculta || 'none'}`,
    `speaking=${options.vorbeste || 'none'}`,
  )
  const peephole = new Peephole()
  const [asculta, vorbeste] = await ctx.check(
    Promise.all([loadLoopVideo(options.asculta), loadLoopVideo(options.vorbeste)]),
  )
  console.info(
    '[ana] loop videos',
    `listening=${asculta ? 'ready' : 'missing'}`,
    `speaking=${vorbeste ? 'ready' : 'missing'}`,
  )
  const dark = darkPeephole()
  const listening = asculta?.texture ?? vorbeste?.texture ?? dark

  // One clip at a time: when Ana starts speaking (or listening) that clip starts from
  // its beginning and plays whole, looping, for as long as the mode lasts. The other
  // clip waits, paused. The picture switches only once the new clip is really playing.
  type Mode = 'speaking' | 'listening'
  let shown: Mode = 'listening'
  let switchTimer = 0
  const clipFor = (mode: Mode) => (mode === 'speaking' ? vorbeste ?? asculta : asculta ?? vorbeste)
  const playClip = (mode: Mode): void => {
    const next = clipFor(mode)
    const other = clipFor(mode === 'speaking' ? 'listening' : 'speaking')
    if (!next) return
    const show = (): void => {
      if (shown !== mode) return
      peephole.show(next.texture)
      if (other && other !== next) other.video.pause()
    }
    next.video.currentTime = 0
    void next.video.play().then(show, show)
  }
  // The agent's mode can flip every few hundred ms; switch only once it has settled.
  const setMode = (mode: Mode): void => {
    window.clearTimeout(switchTimer)
    if (mode === shown) return
    console.info('[ana] mode', mode)
    switchTimer = window.setTimeout(
      () => {
        shown = mode
        playClip(mode)
      },
      mode === 'speaking' ? 150 : 450,
    )
  }

  // A_CONECTARE
  peephole.open(ctx, listening)
  playClip('listening')

  type Overrides = {
    agent?: { prompt?: { prompt?: string }; firstMessage?: string; language?: 'ro' }
  }
  type Attempt = { label: string; overrides: Overrides | null }
  type Session = Awaited<ReturnType<typeof Conversation.startSession>>

  let conversation: Session | null = null
  let removeMic: (() => void) | null = null
  let player: ReturnType<typeof playerLine> | null = null
  let stopFrame: (() => void) | null = null
  let maxTimer = 0

  const teardownAttempt = (): void => {
    window.clearTimeout(maxTimer)
    maxTimer = 0
    stopFrame?.()
    stopFrame = null
    removeMic?.()
    removeMic = null
    player?.remove()
    player = null
    const session = conversation
    conversation = null
    if (session) void session.endSession().catch(() => undefined)
    overlay.subtitle.hide()
  }

  const cleanup = (): void => {
    window.clearTimeout(switchTimer)
    teardownAttempt()
    for (const loop of [asculta, vorbeste]) loop?.video.pause()
    peephole.close()
  }
  ctx.onCleanup(cleanup)

  /** One connection attempt: retry early failures, give up (fallback) on later ones. */
  const runAttempt = async (attempt: Attempt): Promise<'ended' | 'retry' | 'failed'> => {
    console.info(`[ana] connecting (${attempt.label})`)
    const startedAt = performance.now()
    let failed = false
    let finish: () => void = () => undefined
    const ended = new Promise<void>((resolve) => {
      finish = resolve
    })

    try {
      const session = await ctx.check(
        withTimeout(
          Conversation.startSession({
            agentId: AGENT_ID,
            connectionType: 'webrtc',
            ...(attempt.overrides ? { overrides: attempt.overrides } : {}),
            onModeChange: ({ mode }) => setMode(mode === 'speaking' ? 'speaking' : 'listening'),
            // Ana's line stays until it has been read or the next one replaces it.
            onMessage: (message) => {
              if (message.source !== 'ai') return
              overlay.hint.hide()
              overlay.subtitle.show(message.message, readingSeconds(message.message))
            },
            // The player's words: live while speaking (tentative), then the final text.
            onIncomingEvent: (event: { type?: string; [key: string]: unknown }) => {
              const payload =
                event.type === 'tentative_user_transcript'
                  ? event.tentative_user_transcription_event
                  : event.type === 'user_transcript'
                    ? event.user_transcription_event
                    : null
              const text = (payload as { user_transcript?: unknown } | null)?.user_transcript
              if (typeof text === 'string') player?.show(text)
            },
            // A_SFARSIT: every exit path ends here.
            onDisconnect: (details) => {
              console.info('[ana] disconnected', JSON.stringify(details))
              finish()
            },
            onError: (message) => {
              console.warn('[ana] agent error:', message)
              failed = true
              finish()
            },
          }),
          CONNECT_TIMEOUT_MS,
          'agent connection',
        ),
      )

      conversation = session
      if (failed) {
        teardownAttempt()
        return 'retry'
      }
      console.info(`[ana] session live (${attempt.label})`)
      // A_ACTIV
      session.setVolume({ volume: 1 })
      player = playerLine(ctx)
      removeMic = micIcon(ctx)
      maxTimer = window.setTimeout(
        () => void conversation?.endSession().catch(() => finish()),
        options.maxSecunde * 1000,
      )
      let away = 0
      stopFrame = ctx.onFrame((_time, delta) => {
        away = peephole.isLookedAt(ctx) ? 0 : away + delta
        if (away >= options.privireInAfara) {
          away = Number.NEGATIVE_INFINITY
          void conversation?.endSession().catch(() => finish())
        }
      })
      await ctx.check(ended)
      const lasted = performance.now() - startedAt
      teardownAttempt()
      if (failed) {
        console.warn(`[ana] session ended by an agent error after ${Math.round(lasted)}ms`)
        return lasted < EARLY_FAILURE_MS ? 'retry' : 'failed'
      }
      console.info(`[ana] session ended after ${Math.round(lasted)}ms`)
      return 'ended'
    } catch (error) {
      await ctx.check(Promise.resolve()) // rethrows when the day was stopped
      console.warn(`[ana] connection failed (${attempt.label})`, error)
      teardownAttempt()
      return 'retry'
    }
  }

  let needFallback = !AGENT_ID
  try {
    if (needFallback) {
      console.warn('[ana] no agent id; using the fallback line.')
    } else {
      const allowed = await ctx.check(microphoneAllowed())
      console.info('[ana] microphone', allowed ? 'allowed' : 'denied')
      needFallback = !allowed
    }

    if (!needFallback) {
      // Overrides must be enabled on the agent in the ElevenLabs dashboard.
      // When they are not, fall back to a plain session so the scene still works.
      const attempts: Attempt[] = [
        {
          label: 'day 17 prompt + opener',
          overrides: {
            agent: {
              prompt: { prompt: `${PROMPT_BAZA}\n\n${PROMPT_Z17}` },
              language: 'ro',
              ...(options.primaReplica ? { firstMessage: options.primaReplica } : {}),
            },
          },
        },
      ]
      if (options.primaReplica) {
        attempts.push({
          label: 'opener only',
          overrides: { agent: { firstMessage: options.primaReplica } },
        })
      }
      attempts.push({ label: 'agent defaults', overrides: null })

      let live = false
      for (const attempt of attempts) {
        const result = await runAttempt(attempt)
        if (result === 'ended') {
          live = true
          break
        }
        if (result === 'failed') break
      }
      needFallback = !live
    }

    if (needFallback) {
      // A_REZERVA
      console.warn('[ana] using the recorded fallback line.')
      window.clearTimeout(switchTimer)
      shown = 'speaking'
      playClip('speaking')
      await ctx.run([{ tip: 'voce', src: options.rezerva.src, subtitrare: options.rezerva.subtitrare, volum: 2 }])
    }
  } finally {
    cleanup()
    dark.dispose()
  }
}
