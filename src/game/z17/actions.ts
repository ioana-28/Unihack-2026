import * as THREE from 'three'
import type { StateId } from '../../scene/states'
import { registerAction } from '../runner'
import type { ActionContext } from '../runner'
import { gameState } from '../state'
import { runAna } from './ana'
import {
  darkPeephole,
  glowWhile,
  isUnder,
  gazeHit,
  loadImageTexture,
  looksAt,
  modelBounds,
  modelNode,
  Peephole,
  redBanner,
  repeatHint,
  waitForGaze,
} from './shared'

// Day-17 action types, registered with the day runner's extension point.
// Each action reads its parameters from data/z17.json.

type Hint = { text: string; dupa?: number; repeta?: number }
type Frame = { imagine: string; video?: string; secunde: number }

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)
const LOCK_ALL = { isActive: () => false, navigationLocked: () => true }

function hintOf(value: unknown): Hint | null {
  if (!value || typeof value !== 'object') return null
  const hint = value as Hint
  return typeof hint.text === 'string' ? hint : null
}

function startHint(ctx: ActionContext, value: unknown): () => void {
  const hint = hintOf(value)
  return hint ? repeatHint(ctx, hint.text, hint.dupa ?? 0, hint.repeta ?? null) : () => undefined
}

// ---------- Unlock: back to the runner's normal rules

registerAction('deblocheaza', (_a, ctx) => ctx.setControl(null))

// ---------- Global variables (state machine §1)

registerAction('variabila', (a) => {
  const name = str(a.nume)
  if (name === 'film_ascuns' || name === 'film_confiscat' || name === 'a_dat_numele') {
    gameState[name] = a.valoare === true
  } else {
    console.warn(`[z17] Unknown variable "${name}".`)
  }
})

// ---------- Door rings or knocks until the player gazes at it (17.2, 17.5)

registerAction('suna_usa', async (a, ctx) => {
  const door = modelNode(ctx, str(a.usa, 'OPEN_D_ENTRY_leaf'))
  const peep = modelNode(ctx, str(a.vizor, 'OPEN_D_ENTRY_Vizor'))
  if (!door) {
    console.warn('[z17] Front door not found in the model; skipping the ring.')
    return
  }
  const doorPosition = str(a.pozitie, 'hallEntry')
  // Only the door reacts; the player may walk until they stand at the door.
  ctx.setControl({ isActive: () => false, navigationLocked: () => ctx.deps.currentPosition() === doorPosition })
  const ring = ctx.deps.audio.play(str(a.sunet), { at: door, loop: true, volume: num(a.volum, 1) })
  const stopHint = startHint(ctx, a.indiciu)
  const stopGlow = glowWhile(ctx, door)
  try {
    await waitForGaze(ctx, peep ? [door, peep] : [door])
  } finally {
    ring.stop()
    stopHint()
    stopGlow()
  }
  ctx.setControl(LOCK_ALL)
})

// ---------- Peephole with a still image, while nested actions run (17.5)

registerAction('vizor', async (a, ctx) => {
  const peephole = new Peephole()
  const image = await ctx.check(loadImageTexture(str(a.imagine)))
  const texture = image ?? darkPeephole()
  peephole.open(ctx, texture)
  ctx.onCleanup(() => peephole.close())
  try {
    await ctx.run(Array.isArray(a.actiuni) ? a.actiuni : [])
  } finally {
    peephole.close()
    texture.dispose()
  }
})

// ---------- Doamna Ana agent through the peephole (17.2)

registerAction('vizor_ana', async (a, ctx) => {
  const rezerva = (a.rezerva ?? {}) as { src?: unknown; subtitrare?: unknown }
  await runAna(ctx, {
    asculta: str(a.asculta),
    vorbeste: str(a.vorbeste),
    primaReplica: str(a.prima_replica),
    rezerva: { src: str(rezerva.src), subtitrare: str(rezerva.subtitrare) },
    maxSecunde: num(a.max_secunde, 90),
    privireInAfara: num(a.privire_in_afara, 3),
  })
})

// ---------- One recording, several lines: subtitles follow each other (17.5)

registerAction('voce_replici', async (a, ctx) => {
  // Lines are plain strings (split by length) or { text, de_la } with the second they start at.
  type Line = { text: string; start: number | null }
  const lines: Line[] = (Array.isArray(a.replici) ? a.replici : []).flatMap((l): Line[] => {
    if (typeof l === 'string') return [{ text: l, start: null }]
    if (l && typeof l === 'object' && typeof (l as { text?: unknown }).text === 'string') {
      const line = l as { text: string; de_la?: unknown }
      return [{ text: line.text, start: typeof line.de_la === 'number' ? line.de_la : null }]
    }
    return []
  })
  // Not positional: the voice plays the same in both ears.
  const sound = ctx.deps.audio.play(str(a.src), {
    volume: num(a.volum, 1),
    filter: a.filtru === 'telefon' ? 'telefon' : undefined,
  })
  const buffer = await ctx.check(sound.ready)
  const total = buffer ? buffer.duration : 4 * lines.length
  const weight = lines.reduce((sum, line) => sum + line.text.length, 0) || 1
  let at = 0
  const starts = lines.map((line) => {
    const start = line.start ?? at
    at = start + (total * line.text.length) / weight
    return start
  })
  const began = performance.now() / 1000
  try {
    for (let i = 0; i < lines.length; i += 1) {
      const end = i + 1 < lines.length ? starts[i + 1] : total
      const wait = starts[i] - (performance.now() / 1000 - began)
      if (wait > 0) await ctx.wait(wait)
      ctx.deps.overlay.hint.hide()
      ctx.deps.overlay.subtitle.show(lines[i].text, end - starts[i] + 0.2)
      await ctx.wait(Math.max(0, end - (performance.now() / 1000 - began)))
    }
  } finally {
    ctx.deps.overlay.subtitle.hide()
    sound.stop()
  }
})

// ---------- 17.1: look out of the window; the photo is taken N seconds in, the view goes on

registerAction('privire_poza', async (a, ctx) => {
  const { fx, audio, overlay } = ctx.deps
  type PhotoFrame = Frame & { sunet?: string }
  const frames = (Array.isArray(a.cadre) ? a.cadre : []) as PhotoFrame[]
  const photo = (a.poza ?? {}) as { la_secunda?: unknown; sunet?: unknown; text?: unknown; secunde?: unknown }
  fx.preloadWindow(frames.map((f) => f.imagine))
  const glass = ctx.node('fereastra')

  // The photo runs on its own clock, so it does not pause the view.
  const photoTimer = window.setTimeout(() => {
    if (photo.sunet) audio.play(str(photo.sunet))
    if (photo.text) overlay.text.show(str(photo.text), num(photo.secunde, 3))
  }, num(photo.la_secunda, 2) * 1000)
  ctx.onCleanup(() => window.clearTimeout(photoTimer))

  // `sunet` plays from the moment the player looks out until the view ends.
  const viewSound = a.sunet ? audio.play(str(a.sunet), { at: glass, loop: true, volume: num(a.volum, 0.9) }) : null
  let frameSound: ReturnType<typeof audio.play> | null = null
  try {
    for (const frame of frames) {
      await ctx.check(fx.setWindowView(frame.imagine, { video: frame.video, bright: true }))
      frameSound?.stop()
      frameSound = frame.sunet ? audio.play(frame.sunet, { at: glass, loop: true, volume: 0.9 }) : null
      await ctx.wait(frame.secunde)
    }
  } finally {
    frameSound?.stop()
    viewSound?.stop()
  }
  // Let the photo text finish if the view was shorter than it.
  const textEnd = num(photo.la_secunda, 2) + num(photo.secunde, 3)
  const viewLength = frames.reduce((sum, f) => sum + f.secunde, 0)
  if (textEnd > viewLength) await ctx.wait(textEnd - viewLength)
  fx.setWindowBright(false)
})

// ---------- Lighting fades to another preset over N seconds (17.3)

registerAction('lumina_treptata', async (a, ctx) => {
  const lights: THREE.Light[] = []
  ctx.deps.room.traverse((o) => {
    if (o instanceof THREE.HemisphereLight || o instanceof THREE.PointLight) lights.push(o)
  })
  const from = lights.map((l) => l.intensity)
  const target = str(a.lumina, 'noapte') as 'zi' | 'seara' | 'noapte'
  ctx.deps.fx.setLighting(target)
  const to = lights.map((l) => l.intensity)
  const seconds = num(a.secunde, 5)
  const start = performance.now() / 1000
  for (;;) {
    const t = Math.min(1, (performance.now() / 1000 - start) / seconds)
    lights.forEach((l, i) => {
      l.intensity = from[i] + (to[i] - from[i]) * t
    })
    if (t >= 1) break
    await ctx.wait(0.05)
  }
  ctx.deps.fx.setLighting(target)
})

// ---------- Gunfire loop shared by 17.4 → 17.4a → 17.4b (volume ramp, low-pass in the tub)

let gunfire: { sound: THREE.Audio<AudioNode>; filter: BiquadFilterNode } | null = null

function stopGunfire(): void {
  if (!gunfire) return
  if (gunfire.sound.isPlaying) gunfire.sound.stop()
  gunfire.sound.removeFromParent()
  gunfire = null
}

async function startGunfire(ctx: ActionContext, src: string, at: THREE.Object3D | null, volume: number): Promise<void> {
  stopGunfire()
  const buffer = await ctx.check(ctx.deps.audio.load(src))
  if (!buffer) return
  const listener = ctx.deps.audio.listener
  const sound: THREE.Audio<AudioNode> = at ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener)
  if (sound instanceof THREE.PositionalAudio) sound.setRefDistance(2)
  const filter = listener.context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 20000
  sound.setBuffer(buffer)
  sound.setLoop(true)
  sound.setVolume(volume)
  sound.setFilter(filter)
  ;(at ?? listener).add(sound)
  sound.play()
  gunfire = { sound, filter }
  ctx.onCleanup(stopGunfire)
}

// ---------- 17.4: window at night, gunfire closer and closer, flash, hard cut

registerAction('privire_atac', async (a, ctx) => {
  const { fx, overlay, audio } = ctx.deps
  const frames = (Array.isArray(a.cadre) ? a.cadre : []) as Frame[]
  fx.preloadWindow(frames.map((f) => f.imagine))
  const foc = (a.foc ?? {}) as { src?: unknown; volum_start?: unknown; volum_final?: unknown }
  const startVolume = num(foc.volum_start, 0.15)
  const endVolume = num(foc.volum_final, 1.4)
  // Not positional: the gunfire is heard the same in both ears, at full level.
  await startGunfire(ctx, str(foc.src), null, startVolume)

  const total = frames.reduce((sum, f) => sum + f.secunde, 0) || 1
  const began = performance.now() / 1000
  // Separate shots at random intervals, more frequent and louder as the view goes on.
  const shots = (a.impuscaturi ?? null) as {
    src?: unknown
    interval_start?: unknown
    interval_final?: unknown
    volum_start?: unknown
    volum_final?: unknown
  } | null
  let nextShot = began + num(shots?.interval_start, 1.5) * Math.random()
  const stopRamp = ctx.onFrame(() => {
    const nowS = performance.now() / 1000
    const t = Math.min(1, (nowS - began) / total)
    gunfire?.sound.setVolume(startVolume + (endVolume - startVolume) * t * t)
    if (!shots?.src || nowS < nextShot) return
    const volume = num(shots.volum_start, 0.4) + (num(shots.volum_final, 1.3) - num(shots.volum_start, 0.4)) * t
    audio.play(str(shots.src), { volume })
    const interval = num(shots.interval_start, 1.8) + (num(shots.interval_final, 0.5) - num(shots.interval_start, 1.8)) * t
    nextShot = nowS + interval * (0.6 + Math.random() * 0.8)
  })
  try {
    for (const frame of frames) {
      await ctx.check(fx.setWindowView(frame.imagine, { video: frame.video, bright: true }))
      await ctx.wait(frame.secunde)
    }
  } finally {
    stopRamp()
  }

  // A very close flash + sound, then a hard cut to black (no fade).
  if (a.impuscatura) audio.play(str(a.impuscatura), { volume: num(a.impuscatura_volum, 1.4) })
  if (a.geam) audio.play(str(a.geam), { volume: 1.2 })
  await flash(ctx, 0.12)
  overlay.setBlack(true)
  fx.setWindowBright(false)
  await ctx.wait(num(a.negru_secunde, 1))
})

async function flash(ctx: ActionContext, seconds: number): Promise<void> {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4e0, side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
  )
  sphere.renderOrder = 92
  ctx.deps.camera.add(sphere)
  try {
    await ctx.wait(seconds)
  } finally {
    sphere.removeFromParent()
    sphere.geometry.dispose()
    sphere.material.dispose()
  }
}

// ---------- 17.4a: hide in the bathtub — the player walks there with the normal navigation

registerAction('ascunde_in_cada', async (a, ctx) => {
  const { overlay } = ctx.deps
  const bathroom = str(a.pozitie_baie, 'bathroom')
  // Objects are locked; moving between positions stays possible.
  ctx.setControl({ isActive: () => false, navigationLocked: () => false })
  overlay.setBlack(false)
  const removeBanner = redBanner(ctx, str(a.text_rosu))
  try {
    const tub = modelNode(ctx, str(a.cada, 'FIX_BAIE_Bathtub'))
    if (!tub) {
      console.warn('[z17] Bathtub not found in the model; continuing.')
      return
    }
    const stopGlow = glowWhile(ctx, tub)
    try {
      await waitForGaze(ctx, [tub], { allowed: () => ctx.deps.currentPosition() === bathroom })
    } finally {
      stopGlow()
    }
    ctx.setControl(LOCK_ALL)
  } finally {
    removeBanner()
  }
})

// ---------- 17.4b: in the tub — low eye height, muffled gunfire, then silence

registerAction('in_cada', async (a, ctx) => {
  const { overlay, audio } = ctx.deps
  const tub = modelNode(ctx, str(a.cada, 'FIX_BAIE_Bathtub'))
  await ctx.check(overlay.fade(1, 0.5))
  if (tub) {
    const box = modelBounds(ctx, tub)
    const center = box.getCenter(new THREE.Vector3())
    ctx.deps.moveToPoint({ x: center.x, y: box.max.y + num(a.inaltime_peste_margine, 0.12), z: center.z })
  }
  const dim = new THREE.Mesh(
    new THREE.SphereGeometry(0.33, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: num(a.intuneric, 0.88), depthTest: false, depthWrite: false, fog: false }),
  )
  dim.renderOrder = 89
  ctx.deps.camera.add(dim)
  const removeDim = (): void => {
    dim.removeFromParent()
    dim.geometry.dispose()
    dim.material.dispose()
  }
  ctx.onCleanup(removeDim)
  overlay.snap()
  if (gunfire) gunfire.filter.frequency.value = num(a.filtru_hz, 380)
  const breathing = a.respiratie ? audio.play(str(a.respiratie), { loop: true }) : null
  try {
    await ctx.check(overlay.fade(0, 0.5))
    await ctx.wait(num(a.secunde, 10))
    stopGunfire()
    breathing?.stop()
    await ctx.wait(num(a.liniste, 2))
    overlay.text.show(str(a.text), num(a.text_secunde, 3))
    await ctx.wait(num(a.text_secunde, 3))
    await ctx.check(overlay.fade(1, 0.5))
  } finally {
    breathing?.stop()
    removeDim()
  }
  ctx.deps.moveTo(str(a.pozitie_final, 'livingCouch') as StateId)
  overlay.snap()
  ctx.setControl(null)
  await ctx.check(overlay.fade(0, 0.5))
})

// ---------- 17.6: choice cards (2 s gaze, no time limit)

function card(text: string): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> & { setFill: (p: number) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const c = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const draw = (fill: number): void => {
    if (!c) return
    c.clearRect(0, 0, 640, 400)
    c.fillStyle = '#e9e1cc'
    c.beginPath()
    c.roundRect(8, 8, 624, 384, 18)
    c.fill()
    if (fill > 0) {
      c.save()
      c.clip()
      c.fillStyle = 'rgba(224, 160, 68, 0.45)'
      c.fillRect(8, 392 - 384 * fill, 624, 384 * fill)
      c.restore()
    }
    c.strokeStyle = '#6b5233'
    c.lineWidth = 6
    c.stroke()
    c.fillStyle = '#1f1a14'
    c.font = 'italic 600 52px Georgia, "Times New Roman", serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (c.measureText(next).width > 560 && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    lines.push(line)
    lines.forEach((l, i) => c.fillText(l, 320, 200 + (i - (lines.length - 1) / 2) * 64))
    texture.needsUpdate = true
  }
  draw(0)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  ) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> & { setFill: (p: number) => void }
  mesh.renderOrder = 8
  let last = -1
  mesh.setFill = (p) => {
    const v = Math.round(THREE.MathUtils.clamp(p, 0, 1) * 40) / 40
    if (v !== last) {
      last = v
      draw(v)
    }
  }
  return mesh
}

registerAction('alegere', async (a, ctx) => {
  type Option = { text?: unknown; actiuni?: unknown }
  const options = (Array.isArray(a.optiuni) ? a.optiuni : []) as Option[]
  if (options.length === 0) return
  ctx.setControl(LOCK_ALL)
  const camera = ctx.deps.camera
  const eye = camera.getWorldPosition(new THREE.Vector3())
  const forward = camera.getWorldDirection(new THREE.Vector3())
  forward.y = 0
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
  const scene = ctx.deps.overlay.root.parent
  const cards = options.map((option, i) => {
    const mesh = card(str(option.text))
    const side = options.length === 1 ? 0 : i === 0 ? -1 : 1
    mesh.position.copy(eye).addScaledVector(forward, 1.5).addScaledVector(right, side * 0.42)
    mesh.position.y = eye.y - 0.05
    mesh.lookAt(eye.x, mesh.position.y, eye.z)
    scene?.add(mesh)
    return mesh
  })
  const removeCards = (): void => {
    for (const mesh of cards) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.map?.dispose()
      mesh.material.dispose()
    }
  }
  ctx.onCleanup(removeCards)
  let chosen = -1
  try {
    let dwell = 0
    let current = -1
    while (chosen < 0) {
      await ctx.wait(0.1)
      const looked = cards.findIndex((mesh) => looksAt(ctx, mesh))
      dwell = looked >= 0 && looked === current ? dwell + 0.1 : 0
      current = looked
      cards.forEach((mesh, i) => mesh.setFill(i === current ? dwell / num(a.secunde, 2) : 0))
      if (current >= 0 && dwell >= num(a.secunde, 2)) chosen = current
    }
  } finally {
    removeCards()
  }
  ctx.setControl(null)
  const actions = options[chosen]?.actiuni
  await ctx.run(Array.isArray(actions) ? actions : [])
})

// ---------- 17.7: hide the film in the jar (kitchen only)

registerAction('ascunde_borcan', async (a, ctx) => {
  const jar = modelNode(ctx, str(a.borcan, 'Salsa Verde Sauce Jar'))
  const where = str(a.pozitie, 'kitchen')
  // Free to walk (the kitchen marker); only the calendar answers, and it refuses until done.
  ctx.setControl({ isActive: (key) => key === 'calendar', navigationLocked: () => false })
  const stopHint = startHint(ctx, a.indiciu)
  const stopGlow = glowWhile(ctx, jar)
  try {
    if (jar) {
      await waitForGaze(ctx, [jar], { allowed: () => ctx.deps.currentPosition() === where })
    } else {
      console.warn('[z17] Jar not found in the model; the film is hidden automatically.')
    }
  } finally {
    stopHint()
    stopGlow()
  }
  ctx.setControl(LOCK_ALL)
  if (a.sunet) ctx.deps.audio.play(str(a.sunet), { at: jar })
  ctx.deps.overlay.text.show(str(a.text), num(a.secunde, 3))
  await ctx.wait(num(a.secunde, 3))
  gameState.film_ascuns = true
  ctx.setControl(null)
})

// ---------- TV: static on the screen all day; gazing at it shows an image with music

type TvState = { on: boolean }
let tvState: TvState | null = null

registerAction('televizor_17', (a, ctx) => {
  const tv = ctx.node('televizor')
  if (!tv) return
  const box = modelBounds(ctx, tv)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const spawn = { x: 8.074, z: -6.752 }
  const toViewer = new THREE.Vector3(spawn.x - center.x, 0, spawn.z - center.z)
  const alongX = Math.abs(toViewer.x) > Math.abs(toViewer.z)
  const normal = alongX ? new THREE.Vector3(Math.sign(toViewer.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(toViewer.z))
  const width = alongX ? size.z : size.x
  const depth = alongX ? size.x : size.z
  const bodyHeight = Math.min(size.y, width * 0.62)

  const staticCanvas = document.createElement('canvas')
  staticCanvas.width = 96
  staticCanvas.height = 72
  const staticTexture = new THREE.CanvasTexture(staticCanvas)
  staticTexture.magFilter = THREE.NearestFilter
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, bodyHeight * 0.94),
    new THREE.MeshBasicMaterial({ map: staticTexture, toneMapped: false, fog: false }),
  )
  screen.position
    .set(center.x, box.min.y + bodyHeight / 2, center.z)
    .addScaledVector(normal, depth / 2 + 0.006)
  screen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  screen.raycast = () => undefined
  ctx.deps.room.add(screen)

  const state: TvState = { on: true }
  tvState = state
  let image: THREE.Texture | null = null
  void loadImageTexture(str(a.imagine_privire)).then((t) => {
    image = t
  })
  let music: ReturnType<typeof ctx.deps.audio.play> | null = null
  let hovering = false
  let clock = 0
  let rayClock = 0

  const setHover = (on: boolean): void => {
    if (on === hovering) return
    hovering = on
    if (on && image) {
      screen.material.map = image
      screen.material.needsUpdate = true
    } else {
      screen.material.map = staticTexture
      screen.material.needsUpdate = true
    }
    if (on && a.muzica_privire) music = ctx.deps.audio.play(str(a.muzica_privire), { at: tv, loop: true })
    if (!on) {
      music?.stop()
      music = null
    }
  }

  const stopFrame = ctx.onFrame((_time, delta) => {
    screen.visible = state.on
    if (!state.on) {
      setHover(false)
      return
    }
    rayClock += delta
    if (rayClock >= 0.15) {
      rayClock = 0
      const hit = ctx.isLocked() ? null : gazeHit(ctx)
      setHover(Boolean(hit && isUnder(hit, tv)))
    }
    if (hovering && image) return
    clock += delta
    if (clock < 1 / 14) return
    clock = 0
    const c = staticCanvas.getContext('2d')
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
    music?.stop()
    screen.removeFromParent()
    screen.geometry.dispose()
    screen.material.dispose()
    staticTexture.dispose()
    image?.dispose()
    if (tvState === state) tvState = null
  })
})

registerAction('televizor_17_oprit', () => {
  if (tvState) tvState.on = false
})
