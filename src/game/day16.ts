import * as THREE from 'three'
import { getState, STATES } from '../scene/states'
import { assetUrl } from './days'
import type { GameAudio, PlayOptions, Playback } from './audio'
import type { Overlay } from './overlay'
import type { RoomFx } from './room-fx'

// Day 16 extension: peephole, evening lighting fade, layered phone/radio
// audio, passive TV static and the window close-up. It plugs into DayRunner
// through its default action branch, so the existing action types are
// untouched. Every asset failure is non-fatal: a warning is logged and the
// subtitle/fallback keeps the day moving.

const MISSING_VOICE_SECONDS = 4
const POSITIONAL_VOICE_VOLUME = 1.6
const CLOSEUP_FADE = 0.3
const PEEPHOLE_DISTANCE = 1.2
const CHANT_LOUD = 0.35
const CHANT_QUIET = 0.1
const CROWD_VOLUME = 0.3
const STATIC_VOLUME = 0.05
const BUSY_FREQUENCY = 425
const PREFIX = 'ziua16_'
const FACING = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

export type Day16Deps = {
  audio: GameAudio
  overlay: Overlay
  fx: RoomFx
  camera: THREE.Camera
  room: THREE.Object3D
  /** True while an immersive XR session is presenting. */
  isXR?: () => boolean
}

export type Day16Extension = {
  handles: (action: unknown) => boolean
  run: (action: unknown) => Promise<void>
  reset: () => void
}

type VoiceLine = {
  src: string
  subtitrare: string | null
  filtru: 'radio' | 'telefon' | null
  la: string | null
}

type Peephole = {
  close: () => void
}

type TvStatic = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  texture: THREE.CanvasTexture
  timer: number
}

type Waiter = { handle: number; resolve: () => void }

type LightFade = {
  light: THREE.Light
  from: number
  to: number
}

type Day16Action = {
  tip: string
  [key: string]: unknown
}

function bounds(object: THREE.Object3D, space: THREE.Object3D): THREE.Box3 {
  space.updateWorldMatrix(true, false)
  object.updateWorldMatrix(true, true)
  const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert()
  const box = new THREE.Box3()
  const relative = new THREE.Matrix4()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.computeBoundingBox()
    const local = child.geometry.boundingBox
    if (!local) return
    relative.multiplyMatrices(toSpace, child.matrixWorld)
    box.union(local.clone().applyMatrix4(relative))
  })
  return box
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function toVoiceLines(value: unknown): VoiceLine[] {
  if (!Array.isArray(value)) return []
  const lines: VoiceLine[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as {
      src?: unknown
      subtitrare?: unknown
      filtru?: unknown
      la?: unknown
    }
    if (typeof raw.src !== 'string') continue
    lines.push({
      src: raw.src,
      subtitrare: typeof raw.subtitrare === 'string' ? raw.subtitrare : null,
      filtru: raw.filtru === 'radio' || raw.filtru === 'telefon' ? raw.filtru : null,
      la: typeof raw.la === 'string' ? raw.la : null,
    })
  }
  return lines
}

export function createDay16Extension(deps: Day16Deps): Day16Extension {
  const { audio, overlay, fx, camera, room, isXR } = deps

  let generation = 0
  let peephole: Peephole | null = null
  let tvStatic: TvStatic | null = null
  let noiseBuffer: AudioBuffer | null = null
  const waiters = new Set<Waiter>()
  const playbacks = new Set<Playback>()
  const audioNodes = new Set<() => void>()

  const alive = (gen: number): boolean => gen === generation

  const wait = (seconds: number): Promise<void> =>
    new Promise((resolve) => {
      const waiter: Waiter = {
        handle: 0,
        resolve: () => {
          window.clearTimeout(waiter.handle)
          resolve()
        },
      }
      waiter.handle = window.setTimeout(
        () => {
          waiters.delete(waiter)
          resolve()
        },
        Math.max(0, seconds) * 1000,
      )
      waiters.add(waiter)
    })

  const flushWaiters = (): void => {
    for (const waiter of waiters) waiter.resolve()
    waiters.clear()
  }

  const play = (src: string, options: PlayOptions = {}): Playback => {
    const playback = audio.play(src, options)
    playbacks.add(playback)
    void playback.ended.finally(() => playbacks.delete(playback))
    return playback
  }

  const stopPlaybacks = (): void => {
    for (const playback of [...playbacks]) playback.stop()
    playbacks.clear()
  }

  const stopAudioNodes = (): void => {
    for (const stop of [...audioNodes]) stop()
    audioNodes.clear()
  }

  const nodeFor = (key: string): THREE.Object3D | null => {
    const name = STATES.objects[key]
    if (!name) return null
    return (
      room.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ??
      room.getObjectByName(name) ??
      null
    )
  }

  const viewerPosition = (): THREE.Vector3 => {
    const spawn = getState(STATES.spawn).position
    return new THREE.Vector3(spawn.x, spawn.y, spawn.z)
  }

  const hideSubtitle = (): void => {
    overlay.subtitle.hide()
  }

  const voice = async (line: VoiceLine, gen: number): Promise<void> => {
    if (!alive(gen)) return
    const at = line.la ? nodeFor(line.la) : null
    const sound = play(line.src, {
      at,
      filter: line.filtru ?? undefined,
      volume: at ? POSITIONAL_VOICE_VOLUME : 1,
    })
    const buffer = await sound.ready
    if (!alive(gen)) {
      sound.stop()
      return
    }
    const seconds = buffer?.duration ?? MISSING_VOICE_SECONDS
    if (line.subtitrare) {
      overlay.hint.hide()
      overlay.subtitle.show(line.subtitrare, seconds + 0.3)
    }
    if (buffer) await Promise.race([sound.ended, wait(seconds + 1.5)])
    else await wait(MISSING_VOICE_SECONDS)
    if (alive(gen)) hideSubtitle()
    sound.stop()
  }

  const playLines = async (lines: VoiceLine[], gen: number): Promise<void> => {
    for (const line of lines) {
      if (!alive(gen)) return
      await voice(line, gen)
    }
  }

  const noise = (): AudioBuffer => {
    if (noiseBuffer) return noiseBuffer
    const ctx = audio.context
    const length = Math.floor(ctx.sampleRate * 2)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
    noiseBuffer = buffer
    return buffer
  }

  const startStatic = (seconds: number): (() => void) => {
    const ctx = audio.context
    const source = ctx.createBufferSource()
    source.buffer = noise()
    source.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 0.55
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(STATIC_VOLUME, now)
    for (const fraction of [0.32, 0.68, 0.86]) {
      const at = now + Math.max(0.4, seconds * fraction)
      gain.gain.setValueAtTime(STATIC_VOLUME, at)
      gain.gain.linearRampToValueAtTime(0, at + 0.02)
      gain.gain.setValueAtTime(0, at + 0.1)
      gain.gain.linearRampToValueAtTime(STATIC_VOLUME, at + 0.14)
    }
    source.connect(band)
    band.connect(gain)
    gain.connect(audio.listener.getInput())
    source.start(now)

    let stopped = false
    const stop = (): void => {
      if (stopped) return
      stopped = true
      audioNodes.delete(stop)
      try {
        source.stop()
      } catch {
        // already stopped
      }
      source.disconnect()
      band.disconnect()
      gain.disconnect()
    }
    audioNodes.add(stop)
    return stop
  }

  const startBusyTone = (seconds: number): (() => void) => {
    const ctx = audio.context
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = BUSY_FREQUENCY
    const gain = ctx.createGain()
    const now = ctx.currentTime
    const period = 0.5
    for (let t = 0; t < seconds; t += period) {
      const at = now + t
      gain.gain.setValueAtTime(0.12, at)
      gain.gain.linearRampToValueAtTime(0, at + period * 0.55)
      gain.gain.setValueAtTime(0, at + period)
    }
    osc.connect(gain)
    gain.connect(audio.listener.getInput())
    osc.start(now)
    osc.stop(now + seconds + 0.1)

    let stopped = false
    const stop = (): void => {
      if (stopped) return
      stopped = true
      audioNodes.delete(stop)
      try {
        osc.stop()
      } catch {
        // already stopped
      }
      osc.disconnect()
      gain.disconnect()
    }
    audioNodes.add(stop)
    return stop
  }

  const startQuietChant = (): void => {
    const windowNode = nodeFor('window')
    if (!windowNode) return
    play('media/audio/ambient/scandari_z16.mp3', {
      at: windowNode,
      loop: true,
      volume: CHANT_QUIET,
    })
  }

  const runLightingFade = async (secunde: number, gen: number): Promise<void> => {
    const lights: LightFade[] = []
    room.traverse((object) => {
      if (object instanceof THREE.HemisphereLight) {
        lights.push({ light: object, from: object.intensity, to: object.intensity * 0.55 })
      } else if (object instanceof THREE.PointLight) {
        lights.push({ light: object, from: object.intensity, to: object.intensity * 0.8 })
      }
    })
    const started = performance.now()
    for (;;) {
      if (!alive(gen)) return
      const t = Math.min(1, (performance.now() - started) / (secunde * 1000))
      const eased = t * t * (3 - 2 * t)
      for (const entry of lights) {
        entry.light.intensity = entry.from + (entry.to - entry.from) * eased
      }
      if (t >= 1) break
      await wait(0.03)
    }
    fx.setLighting('seara')
  }

  const closePeephole = (): void => {
    const current = peephole
    peephole = null
    current?.close()
  }

  const openPeephole = (src: string | null): void => {
    closePeephole()
    const wasVisible = room.visible
    room.visible = false

    const video = document.createElement('video')
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' })
    video.setAttribute('playsinline', '')

    const backdropGeometry = new THREE.PlaneGeometry(1, 1)
    const backdropMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
    const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial)
    backdrop.name = 'ziua16_vizor_backdrop'
    backdrop.position.set(0, 0, -PEEPHOLE_DISTANCE - 0.01)
    backdrop.renderOrder = 44
    camera.add(backdrop)

    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
    const geometry = new THREE.PlaneGeometry(1, 1)
    const screen = new THREE.Mesh(geometry, material)
    screen.name = 'ziua16_vizor'
    screen.position.set(0, 0, -PEEPHOLE_DISTANCE)
    screen.renderOrder = 45
    camera.add(screen)

    const layout = (): void => {
      const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null
      const fov = perspective?.fov ?? 62
      const aspect = perspective?.aspect ?? 16 / 9
      const inXR = isXR?.() ?? false
      const viewHeight = 2 * PEEPHOLE_DISTANCE * Math.tan(THREE.MathUtils.degToRad(fov * 0.5))
      const viewWidth = viewHeight * (inXR ? aspect * 0.5 : aspect)
      const videoAspect =
        video.videoWidth > 0 && video.videoHeight > 0
          ? video.videoWidth / video.videoHeight
          : 16 / 9
      let width = viewWidth
      let height = width / videoAspect
      if (inXR) {
        // Same cover fit as the prologue screen: fill each eye, no letterbox.
        if (height < viewHeight) {
          height = viewHeight
          width = height * videoAspect
        }
      } else if (height > viewHeight) {
        height = viewHeight
        width = height * videoAspect
      }
      screen.scale.set(width, height, 1)
      const overscan = inXR ? 1.3 : 1.02
      backdrop.scale.set(viewWidth * overscan, viewHeight * overscan, 1)
    }
    layout()

    let videoTexture: THREE.VideoTexture | null = null
    let closed = false

    video.addEventListener('loadedmetadata', () => {
      if (!closed) layout()
    })
    video.addEventListener(
      'loadeddata',
      () => {
        if (closed) return
        videoTexture = new THREE.VideoTexture(video)
        videoTexture.colorSpace = THREE.SRGBColorSpace
        videoTexture.minFilter = THREE.LinearFilter
        videoTexture.magFilter = THREE.LinearFilter
        videoTexture.generateMipmaps = false
        material.map = videoTexture
        material.color.setHex(0xffffff)
        material.needsUpdate = true
        layout()
        void video.play().catch(() => undefined)
      },
      { once: true },
    )
    video.addEventListener(
      'error',
      () => console.warn('[day16] Peephole video missing; showing a black screen.'),
      { once: true },
    )
    if (src) {
      video.src = assetUrl(src)
      video.load()
    }

    const close = (): void => {
      if (closed) return
      closed = true
      screen.parent?.remove(screen)
      backdrop.parent?.remove(backdrop)
      video.pause()
      video.removeAttribute('src')
      video.load()
      videoTexture?.dispose()
      geometry.dispose()
      material.dispose()
      backdropGeometry.dispose()
      backdropMaterial.dispose()
      room.visible = wasVisible
    }

    peephole = { close }
  }

  const runPeephole = async (action: Day16Action, gen: number): Promise<void> => {
    const lines = toVoiceLines(action.replici)
    await overlay.fade(1, CLOSEUP_FADE)
    if (!alive(gen)) return
    openPeephole(asString(action.video))
    await overlay.fade(0, CLOSEUP_FADE)
    await playLines(lines, gen)
    if (!alive(gen)) return
    await overlay.fade(1, CLOSEUP_FADE)
    closePeephole()
    await overlay.fade(0, CLOSEUP_FADE)
  }

  const runPhoneCall = async (action: Day16Action, gen: number): Promise<void> => {
    const phone = nodeFor('phone')
    const crowd = play('media/audio/ambient/multime_z20.mp3', {
      at: phone,
      loop: true,
      volume: CROWD_VOLUME,
    })
    try {
      await playLines(toVoiceLines(action.replici), gen)
    } finally {
      crowd.stop()
    }
    if (!alive(gen)) return
    const stopBusy = startBusyTone(2)
    await wait(2.05)
    stopBusy()
  }

  const runWindow = async (action: Day16Action, gen: number): Promise<void> => {
    const image = asString(action.imagine) ?? 'media/img/img_piata_cativaoameni.jpg'
    const video = asString(action.video)
    const lines = toVoiceLines(action.replici)
    fx.preloadWindow([image])
    const windowNode = nodeFor('window')
    const chant = windowNode
      ? play('media/audio/ambient/scandari_z16.mp3', {
          at: windowNode,
          loop: true,
          volume: CHANT_LOUD,
        })
      : null
    try {
      await fx.setWindowView(image, { video: video ?? undefined, bright: true })
      if (!alive(gen)) return
      await wait(1)
      const voiceDone = playLines(lines, gen)
      await Promise.all([wait(14), voiceDone])
    } finally {
      chant?.stop()
    }
    if (!alive(gen)) return
    await fx.setWindowView(image, { bright: false })
    startQuietChant()
  }

  const runRadio = async (action: Day16Action, gen: number): Promise<void> => {
    const src = asString(action.src)
    if (!src) return
    const radio = nodeFor('radio')
    const sound = play(src, {
      at: radio,
      filter: 'radio',
      volume: radio ? POSITIONAL_VOICE_VOLUME : 1,
    })
    const buffer = await sound.ready
    if (!alive(gen)) {
      sound.stop()
      return
    }
    const seconds = buffer?.duration ?? MISSING_VOICE_SECONDS
    const stopNoise = startStatic(seconds)
    const subtitle = asString(action.subtitrare)
    if (subtitle) {
      overlay.hint.hide()
      overlay.subtitle.show(subtitle, seconds + 0.3)
    }
    if (buffer) await Promise.race([sound.ended, wait(seconds + 1.5)])
    else await wait(MISSING_VOICE_SECONDS)
    stopNoise()
    if (alive(gen)) hideSubtitle()
    sound.stop()
  }

  const setupTvStatic = (): void => {
    if (tvStatic) return
    const tv = nodeFor('tv')
    if (!tv) {
      console.warn('[day16] TV not found; passive static skipped.')
      return
    }
    const box = bounds(tv, room)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const viewer = viewerPosition()
    const toViewer = viewer.clone().sub(center)
    const alongX = Math.abs(toViewer.x) > Math.abs(toViewer.z)
    const normal = alongX
      ? new THREE.Vector3(Math.sign(toViewer.x), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(toViewer.z))
    const right = new THREE.Vector3().crossVectors(UP, normal)
    const bodyWidth = alongX ? size.z : size.x
    const depth = alongX ? size.x : size.z
    const bodyHeight = Math.min(size.y, bodyWidth * 0.62)
    const screenWidth = bodyWidth * 0.66
    const screenHeight = bodyHeight * 0.7
    const screenCenter = new THREE.Vector3(center.x, box.min.y + bodyHeight * 0.52, center.z)
      .addScaledVector(normal, depth / 2 + 0.004)
      .addScaledVector(right, -bodyWidth * 0.1)

    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 72
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = THREE.NearestFilter
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), material)
    mesh.name = 'ziua16_tv_static'
    mesh.position.copy(screenCenter)
    mesh.quaternion.setFromUnitVectors(FACING, normal)
    mesh.raycast = () => undefined
    room.add(mesh)

    const draw = (): void => {
      const image = ctx.createImageData(96, 72)
      for (let i = 0; i < image.data.length; i += 4) {
        const v = 30 + Math.random() * 170
        image.data[i] = v
        image.data[i + 1] = v
        image.data[i + 2] = v * 1.05
        image.data[i + 3] = 255
      }
      ctx.putImageData(image, 0, 0)
      texture.needsUpdate = true
    }
    draw()
    const timer = window.setInterval(draw, 1000 / 14)
    tvStatic = { mesh, texture, timer }
  }

  const removeTvStatic = (): void => {
    if (!tvStatic) return
    window.clearInterval(tvStatic.timer)
    tvStatic.mesh.parent?.remove(tvStatic.mesh)
    tvStatic.mesh.geometry.dispose()
    tvStatic.mesh.material.dispose()
    tvStatic.texture.dispose()
    tvStatic = null
  }

  const reset = (): void => {
    generation += 1
    flushWaiters()
    stopPlaybacks()
    stopAudioNodes()
    closePeephole()
    removeTvStatic()
    hideSubtitle()
  }

  const handles = (action: unknown): boolean => {
    if (!action || typeof action !== 'object') return false
    const tip = (action as { tip?: unknown }).tip
    return typeof tip === 'string' && tip.startsWith(PREFIX)
  }

  const run = async (action: unknown): Promise<void> => {
    const a = action as Day16Action
    const gen = generation
    try {
      switch (a.tip) {
        case 'ziua16_tv_static':
          setupTvStatic()
          return
        case 'ziua16_vizor':
          return await runPeephole(a, gen)
        case 'ziua16_lumina_seara':
          return await runLightingFade(asNumber(a.secunde) ?? 5, gen)
        case 'ziua16_apel':
          return await runPhoneCall(a, gen)
        case 'ziua16_fereastra':
          return await runWindow(a, gen)
        case 'ziua16_radio':
          return await runRadio(a, gen)
        default:
          console.warn(`[day16] Unknown action "${a.tip}", skipped.`)
      }
    } catch (error) {
      console.warn(`[day16] Action "${a.tip}" failed; continuing.`, error)
    }
  }

  return { handles, run, reset }
}
