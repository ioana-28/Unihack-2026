import * as THREE from 'three'
import { getState, STATES } from '../scene/states'
import type { GameAudio, PlayOptions, Playback } from './audio'
import type { Overlay } from './overlay'
import type { RoomFx } from './room-fx'

// Day 19 extension: passive TV static (the TV is on all day but inactive) and
// the Serbian radio bed with static/dropouts. It plugs into DayRunner through
// its default action branch, leaving the existing action types untouched.
// Missing audio still shows the subtitle for a few seconds and the day
// continues.

const MISSING_VOICE_SECONDS = 4
const POSITIONAL_VOICE_VOLUME = 1.6
const STATIC_VOLUME = 0.05
const PREFIX = 'ziua19_'
const FACING = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
// Pan the wide square photo so the window opening frames the soldiers at the
// bottom-left of img_piata_doarsoldati_19 instead of the empty centre.
const WINDOW_OFFSET = new THREE.Vector2(-0.26, -0.32)

export type Day19Deps = {
  audio: GameAudio
  overlay: Overlay
  room: THREE.Object3D
  fx: RoomFx
}

export type Day19Extension = {
  handles: (action: unknown) => boolean
  run: (action: unknown) => Promise<void>
  reset: () => void
}

type Day19Action = {
  tip: string
  [key: string]: unknown
}

type TvStatic = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  texture: THREE.CanvasTexture
  timer: number
}

type Waiter = { handle: number; resolve: () => void }

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

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

export function createDay19Extension(deps: Day19Deps): Day19Extension {
  const { audio, overlay, room, fx } = deps

  let generation = 0
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

  const setupTvStatic = (): void => {
    if (tvStatic) return
    const tv = nodeFor('tv')
    if (!tv) {
      console.warn('[day19] TV not found; passive static skipped.')
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
    mesh.name = 'ziua19_tv_static'
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

  const applyWindowOffset = (): void => {
    const view = room.getObjectByName('ecran_fereastra')
    if (!(view instanceof THREE.Mesh)) return
    const material = view.material
    if (!(material instanceof THREE.MeshBasicMaterial) || !material.map) return
    material.map.offset.set(WINDOW_OFFSET.x, WINDOW_OFFSET.y)
  }

  const runWindow = async (action: Day19Action, gen: number): Promise<void> => {
    const image = asString(action.imagine) ?? 'media/img/img_piata_doarsoldati_19.jpg'
    const seconds = typeof action.secunde === 'number' ? action.secunde : 10
    const subtitle = asString(action.subtitrare)
    const windowNode = nodeFor('window')
    fx.preloadWindow([image])
    const wind = windowNode
      ? play('media/audio/ambient/vant.mp3', {
          at: windowNode,
          loop: true,
          volume: 0.3,
        })
      : null
    try {
      await fx.setWindowView(image, { bright: true })
      if (!alive(gen)) return
      applyWindowOffset()
      if (subtitle) {
        overlay.hint.hide()
        overlay.subtitle.show(subtitle, Math.min(seconds, 5))
      }
      await wait(seconds)
    } finally {
      wind?.stop()
    }
    if (!alive(gen)) return
    overlay.subtitle.hide()
    fx.setWindowBright(false)
  }

  const runRadio = async (action: Day19Action, gen: number): Promise<void> => {
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
    if (alive(gen)) overlay.subtitle.hide()
    sound.stop()
  }

  const reset = (): void => {
    generation += 1
    flushWaiters()
    stopPlaybacks()
    stopAudioNodes()
    removeTvStatic()
    overlay.subtitle.hide()
  }

  const handles = (action: unknown): boolean => {
    if (!action || typeof action !== 'object') return false
    const tip = (action as { tip?: unknown }).tip
    return typeof tip === 'string' && tip.startsWith(PREFIX)
  }

  const run = async (action: unknown): Promise<void> => {
    const a = action as Day19Action
    const gen = generation
    try {
      switch (a.tip) {
        case 'ziua19_tv_static':
          setupTvStatic()
          return
        case 'ziua19_fereastra':
          return await runWindow(a, gen)
        case 'ziua19_radio':
          return await runRadio(a, gen)
        default:
          console.warn(`[day19] Unknown action "${a.tip}", skipped.`)
      }
    } catch (error) {
      console.warn(`[day19] Action "${a.tip}" failed; continuing.`, error)
    }
  }

  return { handles, run, reset }
}
