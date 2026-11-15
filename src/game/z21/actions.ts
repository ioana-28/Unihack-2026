import * as THREE from 'three'
import { registerAction } from '../runner'
import type { ActionContext } from '../runner'
import { loadLoopVideo, modelBounds } from '../z17/shared'

// Day 21: the TV is the mandatory object. Its screen shows static; gazing at
// it plays the rally broadcast ON THE TV SCREEN, then cuts abruptly to static.

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

type Screen = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  staticTexture: THREE.CanvasTexture
  showStatic: () => void
}
let screen: Screen | null = null

/** Static on the real TV's screen for the whole day. */
registerAction('ecran_tv_21', (_a, ctx) => {
  const tv = ctx.node('televizor')
  if (!tv) {
    console.warn('[z21] TV not found in the model.')
    return
  }
  const box = modelBounds(ctx, tv)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // The TV faces the couch (the day's start position).
  const toViewer = new THREE.Vector3(8.074 - center.x, 0, -6.752 - center.z)
  const alongX = Math.abs(toViewer.x) > Math.abs(toViewer.z)
  const normal = alongX ? new THREE.Vector3(Math.sign(toViewer.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(toViewer.z))
  const width = alongX ? size.z : size.x
  const depth = alongX ? size.x : size.z
  const bodyHeight = Math.min(size.y, width * 0.62)

  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 72
  const staticTexture = new THREE.CanvasTexture(canvas)
  staticTexture.magFilter = THREE.NearestFilter
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, bodyHeight * 0.94),
    new THREE.MeshBasicMaterial({ map: staticTexture, toneMapped: false, fog: false }),
  )
  mesh.position
    .set(center.x, box.min.y + bodyHeight / 2, center.z)
    .addScaledVector(normal, depth / 2 + 0.006)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  mesh.raycast = () => undefined
  ctx.deps.room.add(mesh)

  const entry: Screen = {
    mesh,
    staticTexture,
    showStatic: () => {
      mesh.material.map = staticTexture
      mesh.material.needsUpdate = true
    },
  }
  screen = entry

  let clock = 0
  const stopFrame = ctx.onFrame((_time, delta) => {
    if (mesh.material.map !== staticTexture) return
    clock += delta
    if (clock < 1 / 14) return
    clock = 0
    const c = canvas.getContext('2d')
    if (!c) return
    const data = c.createImageData(96, 72)
    for (let i = 0; i < data.data.length; i += 4) {
      const v = 30 + Math.random() * 170
      data.data[i] = v
      data.data[i + 1] = v
      data.data[i + 2] = v * 1.05
      data.data[i + 3] = 255
    }
    c.putImageData(data, 0, 0)
    staticTexture.needsUpdate = true
  })
  ctx.onCleanup(() => {
    stopFrame()
    mesh.removeFromParent()
    mesh.geometry.dispose()
    mesh.material.dispose()
    staticTexture.dispose()
    if (screen === entry) screen = null
  })
})

type TimedLine = { text: string; de_la: number; secunde: number }

function linesOf(value: unknown): TimedLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((l): TimedLine[] => {
    const line = l as Partial<TimedLine>
    return typeof line?.text === 'string' ? [{ text: line.text, de_la: num(line.de_la, 0), secunde: num(line.secunde, 3) }] : []
  })
}

/**
 * Plays the broadcast once on the TV screen, then cuts to static.
 * `cu_sonor: true` = the video's own sound track is heard (one mp4); otherwise
 * the video is muted and `sunet` is played next to it. `subtitrari` appear at
 * their second from the start; `la_final` appears right after the cut.
 */
registerAction('emisiune_tv', async (a, ctx: ActionContext) => {
  const target = screen
  if (!target) return
  const clip = await ctx.check(loadLoopVideo(str(a.video)))
  if (!clip) {
    console.warn('[z21] Broadcast video missing; the TV stays on static.')
    return
  }
  const { video, texture } = clip
  const { overlay } = ctx.deps
  video.loop = false
  video.currentTime = 0
  // The picture stays muted; the sound goes through the game's audio (Web Audio),
  // decoded from `sunet` (which can be the same mp4), so the browser cannot block it.
  const soundSrc = str(a.sunet) || (a.cu_sonor === true ? str(a.video) : '')
  if (soundSrc) await ctx.check(ctx.deps.audio.load(soundSrc))
  const sound = soundSrc
    ? ctx.deps.audio.play(soundSrc, {
        at: a.sunet_pozitional === true ? ctx.node('televizor') : null,
        volume: num(a.volum, 1.5),
      })
    : null
  const timers: number[] = []
  try {
    await ctx.check(video.play().catch(() => undefined))
    for (const line of linesOf(a.subtitrari)) {
      timers.push(
        window.setTimeout(() => {
          overlay.hint.hide()
          overlay.subtitle.show(line.text, line.secunde)
        }, line.de_la * 1000),
      )
    }
    target.mesh.material.map = texture
    target.mesh.material.needsUpdate = true
    const length = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : num(a.secunde, 15)
    await ctx.check(
      Promise.race([
        new Promise<void>((resolve) => video.addEventListener('ended', () => resolve(), { once: true })),
        new Promise<void>((resolve) => window.setTimeout(resolve, (length + 0.5) * 1000)),
      ]),
    )
  } finally {
    // Abrupt cut: straight back to static, sound off.
    for (const timer of timers) window.clearTimeout(timer)
    overlay.subtitle.hide()
    sound?.stop()
    target.showStatic()
    video.pause()
    video.removeAttribute('src')
    video.load()
    texture.dispose()
  }
  const final = (a.la_final ?? null) as { text?: unknown; secunde?: unknown } | null
  if (final && typeof final.text === 'string') {
    overlay.subtitle.show(final.text, num(final.secunde, 3))
    await ctx.wait(num(final.secunde, 3))
  }
})

/** A subtitle with no voice (e.g. Radu's thought), shown at the bottom for N seconds. */
registerAction('subtitrare', async (a, ctx) => {
  const text = str(a.text)
  if (!text) return
  const seconds = num(a.secunde, 4)
  ctx.deps.overlay.hint.hide()
  ctx.deps.overlay.subtitle.show(text, seconds)
  await ctx.wait(seconds)
})
