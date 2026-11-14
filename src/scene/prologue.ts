import * as THREE from 'three'
import { fetchCachedBlob } from '../cache'
import { canvasTexture } from '../textures'

const PROLOGUE_VERSION = '2026-11-14'
const DEFAULT_VIDEO_URL = `/media/prologue.mp4?v=${PROLOGUE_VERSION}`
const VIDEO_URL =
  new URLSearchParams(window.location.search).get('video') ?? DEFAULT_VIDEO_URL
const VIDEO_CACHE = `apartment-video-${PROLOGUE_VERSION}`
const SCREEN_DISTANCE = 2
const BACKDROP_OVERSCAN = 1.3
const FADE_SECONDS = 1
const FALLBACK_MS = 12000
const DEFAULT_ASPECT = 16 / 9

export type PrologueScreen = {
  object: THREE.Group
  start: () => void
  stop: () => void
  update: (delta: number) => void
  dispose: () => void
}

export function createPrologueScreen(
  camera: THREE.PerspectiveCamera,
  canReveal: () => boolean,
  onEnded: () => void,
): PrologueScreen {
  const object = new THREE.Group()
  object.name = 'prologue-screen'
  object.position.set(0, 0, -SCREEN_DISTANCE)
  object.visible = false

  const video = document.createElement('video')
  video.preload = 'auto'
  video.loop = false
  video.muted = false
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.style.cssText =
    'position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.append(video)

  let videoObjectUrl: string | null = null

  const loadVideo = async (): Promise<void> => {
    try {
      const blob = await fetchCachedBlob(VIDEO_URL, {
        cacheName: VIDEO_CACHE,
        contentType: 'video/mp4',
      })
      videoObjectUrl = URL.createObjectURL(blob)
      video.src = videoObjectUrl
    } catch (error) {
      console.error('Failed to cache the prologue video; falling back to the network', error)
      video.src = VIDEO_URL
    }
    video.load()
  }

  void loadVideo()

  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  const poster = new THREE.TextureLoader().load('/media/prologue-poster.jpg')
  poster.colorSpace = THREE.SRGBColorSpace

  const backdropMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070b,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial)
  backdrop.renderOrder = 100
  object.add(backdrop)

  const screenMaterial = new THREE.MeshBasicMaterial({
    map: poster,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMaterial)
  screen.renderOrder = 101
  object.add(screen)

  const loadingTexture = canvasTexture(1024, 160, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(8, 7, 6, 0.78)'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.5)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, width - 2, height - 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#efe5cf'
    ctx.font = '500 46px system-ui, "Segoe UI", sans-serif'
    ctx.fillText('Se încarcă apartamentul…', width / 2, height / 2)
  })
  const loadingMaterial = new THREE.MeshBasicMaterial({
    map: loadingTexture,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const loading = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.18), loadingMaterial)
  loading.position.set(0, -1.05, 0.01)
  loading.renderOrder = 102
  loading.visible = false
  object.add(loading)

  let state: 'idle' | 'playing' | 'fading' | 'done' = 'idle'
  let opacity = 1
  let fallback = 0
  let videoAspect = DEFAULT_ASPECT

  const syncAspect = (): void => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      videoAspect = video.videoWidth / video.videoHeight
    }
  }

  const showVideo = (): void => {
    screenMaterial.map = texture
    screenMaterial.needsUpdate = true
  }

  if (video.readyState >= 2) showVideo()
  else video.addEventListener('loadeddata', showVideo, { once: true })
  video.addEventListener('loadedmetadata', syncAspect)

  const layout = (): void => {
    const viewHeight = 2 * SCREEN_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    const viewWidth = viewHeight * camera.aspect * 0.5
    backdrop.scale.set(viewWidth * BACKDROP_OVERSCAN, viewHeight * BACKDROP_OVERSCAN, 1)

    let width = viewWidth
    let height = width / videoAspect
    if (height < viewHeight) {
      height = viewHeight
      width = height * videoAspect
    }
    screen.scale.set(width, height, 1)
  }

  const handleEnded = (): void => {
    if (state === 'playing') state = 'fading'
  }

  const play = (): void => {
    void video.play().catch(() => {
      if (video.muted) {
        if (state === 'playing') state = 'fading'
        return
      }
      video.muted = true
      void video.play().catch(() => {
        if (state === 'playing') state = 'fading'
      })
    })
  }

  const start = (): void => {
    window.clearTimeout(fallback)
    video.removeEventListener('ended', handleEnded)
    syncAspect()
    layout()
    state = 'playing'
    opacity = 1
    screenMaterial.opacity = 1
    backdropMaterial.opacity = 1
    loading.visible = false
    object.visible = true
    camera.focus = SCREEN_DISTANCE
    video.loop = false
    if (video.readyState >= 1) video.currentTime = 0
    video.addEventListener('ended', handleEnded, { once: true })
    play()
    fallback = window.setTimeout(() => {
      if (state === 'playing') state = 'fading'
    }, FALLBACK_MS)
  }

  const stop = (): void => {
    window.clearTimeout(fallback)
    video.removeEventListener('ended', handleEnded)
    video.pause()
    state = 'idle'
    opacity = 1
    screenMaterial.opacity = 1
    backdropMaterial.opacity = 1
    loading.visible = false
    object.visible = false
  }

  const update = (delta: number): void => {
    if (!object.visible) return
    layout()
    if (state !== 'fading') return
    if (!canReveal()) {
      loading.visible = true
      return
    }
    loading.visible = false
    opacity = Math.max(0, opacity - delta / FADE_SECONDS)
    screenMaterial.opacity = opacity
    backdropMaterial.opacity = opacity
    if (opacity > 0) return
    state = 'done'
    object.visible = false
    onEnded()
  }

  const dispose = (): void => {
    stop()
    video.removeEventListener('loadedmetadata', syncAspect)
    video.removeEventListener('loadeddata', showVideo)
    video.removeAttribute('src')
    video.load()
    video.remove()
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl)
    texture.dispose()
    poster.dispose()
    loadingTexture.dispose()
    backdropMaterial.dispose()
    screenMaterial.dispose()
    loadingMaterial.dispose()
    backdrop.geometry.dispose()
    screen.geometry.dispose()
    loading.geometry.dispose()
  }

  return { object, start, stop, update, dispose }
}
