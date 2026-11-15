import * as THREE from 'three'
import { mediaSrc } from '../preload'

// Fixed peephole close-up used by the day 18 extension. The view is placed in
// front of the player at the moment it opens and stays in world space, so head
// rotation reveals the room around it. Videos are muted and play once; when a
// video is missing the generated stairwell fallback stays visible.

const PEEPHOLE_DISTANCE = 0.85
const PEEPHOLE_RADIUS = 0.44
const PEEPHOLE_RING = 0.49

type ActivePeephole = {
  group: THREE.Group
  close: () => void
}

export type Peephole = {
  readonly group: THREE.Group | null
  open: (src: string | null) => void
  close: () => void
  isOpen: () => boolean
  dispose: () => void
}

function makeFallback(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const shade = ctx.createRadialGradient(128, 110, 8, 128, 128, 128)
  shade.addColorStop(0, '#3a362e')
  shade.addColorStop(0.5, '#181715')
  shade.addColorStop(1, '#050505')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = 'rgba(255, 214, 150, 0.12)'
  ctx.fillRect(20, 36, 18, 184)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(164, 0, 38, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createPeephole(camera: THREE.Camera): Peephole {
  let active: ActivePeephole | null = null

  const close = (): void => {
    const current = active
    active = null
    current?.close()
  }

  const open = (src: string | null): void => {
    close()

    const parent = camera.parent ?? camera
    const group = new THREE.Group()
    group.name = 'day18_vizor'
    parent.add(group)
    group.position.copy(camera.position)
    group.quaternion.copy(camera.quaternion)
    group.translateZ(-PEEPHOLE_DISTANCE)

    const backdropGeometry = new THREE.PlaneGeometry(4, 4)
    const backdropMaterial = new THREE.MeshBasicMaterial({
      color: 0x050505,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    })
    const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial)
    backdrop.renderOrder = 38
    group.add(backdrop)

    const fallback = makeFallback()
    const circleGeometry = new THREE.CircleGeometry(PEEPHOLE_RADIUS, 64)
    const circleMaterial = new THREE.MeshBasicMaterial({
      map: fallback,
      color: fallback ? 0xffffff : 0x0a0a0a,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    })
    const circle = new THREE.Mesh(circleGeometry, circleMaterial)
    circle.renderOrder = 39
    group.add(circle)

    const ringGeometry = new THREE.RingGeometry(PEEPHOLE_RADIUS, PEEPHOLE_RING, 64)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x1b1a18,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.renderOrder = 40
    group.add(ring)

    const video = document.createElement('video')
    Object.assign(video, { muted: true, loop: false, playsInline: true, preload: 'auto' })
    video.setAttribute('playsinline', '')
    let videoTexture: THREE.VideoTexture | null = null
    let closed = false

    video.addEventListener(
      'loadeddata',
      () => {
        if (closed) return
        videoTexture = new THREE.VideoTexture(video)
        videoTexture.colorSpace = THREE.SRGBColorSpace
        circleMaterial.map = videoTexture
        circleMaterial.color.setHex(0xffffff)
        circleMaterial.needsUpdate = true
        void video.play().catch(() => undefined)
      },
      { once: true },
    )
    video.addEventListener(
      'error',
      () => console.warn('[day18] Peephole video missing; using the dark fallback.'),
      { once: true },
    )
    if (src) {
      video.src = mediaSrc(src)
      video.load()
    }

    const dispose = (): void => {
      if (closed) return
      closed = true
      group.parent?.remove(group)
      video.pause()
      video.removeAttribute('src')
      video.load()
      videoTexture?.dispose()
      fallback?.dispose()
      backdropGeometry.dispose()
      backdropMaterial.dispose()
      circleGeometry.dispose()
      circleMaterial.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
    }

    active = { group, close: dispose }
  }

  return {
    get group() {
      return active?.group ?? null
    },
    open,
    close,
    isOpen: () => active !== null,
    dispose: close,
  }
}
