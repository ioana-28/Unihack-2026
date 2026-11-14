import * as THREE from 'three'
import { canvasTexture } from '../textures'
import type { Reticle } from './reticle'

const PAGE_URLS = ['/media/newspaper_page1.jpeg', '/media/newspaper_page2.jpeg'] as const
const PAGE_ASPECTS = [471 / 674, 477 / 669] as const
const PANEL_DISTANCE = 1.15
const PAGE_HEIGHT_RATIO = 0.68
const PAGE_WIDTH_RATIO = 0.82
const FRAME_PADDING = 0.05
const CLOSE_GAP = 0.02
const CONTROL_DWELL = 1.2
const CLOSE_ASPECT = 4
const OPEN_FADE_SECONDS = 0.18
const CLICK_SLOP = 6
const ORIGIN = new THREE.Vector2(0, 0)

type ControlId = 'previous' | 'next' | 'close'

const CONTROL_PROMPTS: Record<ControlId, string> = {
  previous: 'Pagina anterioară',
  next: 'Pagina următoare',
  close: 'Închide ziarul',
}

export type NewspaperPopup = {
  object: THREE.Group
  open: () => void
  close: () => void
  isOpen: () => boolean
  update: (delta: number) => void
  dispose: () => void
}

export type NewspaperPopupOptions = {
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  reticle: Reticle
  onClose: () => void
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function arrowTexture(direction: 'previous' | 'next'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height)
    roundedRect(ctx, 3, 3, width - 6, height - 6, 24)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.88)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.62)'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.fillStyle = '#f3e8d3'
    ctx.beginPath()
    if (direction === 'next') {
      ctx.moveTo(50, 32)
      ctx.lineTo(90, 64)
      ctx.lineTo(50, 96)
    } else {
      ctx.moveTo(78, 32)
      ctx.lineTo(38, 64)
      ctx.lineTo(78, 96)
    }
    ctx.closePath()
    ctx.fill()
  })
}

export function createNewspaperPopup(options: NewspaperPopupOptions): NewspaperPopup {
  const { camera, canvas, reticle, onClose } = options

  const object = new THREE.Group()
  object.name = 'newspaper-popup'
  object.visible = false

  const frameTexture = canvasTexture(
    512,
    Math.round(512 / PAGE_ASPECTS[0]),
    (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height)
      roundedRect(ctx, 3, 3, width - 6, height - 6, 34)
      ctx.fillStyle = 'rgba(8, 7, 6, 0.46)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(224, 160, 68, 0.58)'
      ctx.lineWidth = 3
      ctx.stroke()
    },
  )

  const placeholderTexture = canvasTexture(
    512,
    Math.round(512 / PAGE_ASPECTS[0]),
    (ctx, width, height) => {
      ctx.fillStyle = '#ddd0b4'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(43, 36, 27, 0.72)'
      ctx.font = '500 34px system-ui, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Se încarcă ziarul…', width / 2, height / 2)
    },
  )

  const frameMaterial = new THREE.MeshBasicMaterial({
    map: frameTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const pageMaterial = new THREE.MeshBasicMaterial({
    map: placeholderTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const closeTexture = canvasTexture(512, 128, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height)
    roundedRect(ctx, 3, 3, width - 6, height - 6, 24)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.88)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.62)'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.fillStyle = '#f3e8d3'
    ctx.font = '600 44px system-ui, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Închide', width / 2, height / 2)
  })
  const closeMaterial = new THREE.MeshBasicMaterial({
    map: closeTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const previousTexture = arrowTexture('previous')
  const previousMaterial = new THREE.MeshBasicMaterial({
    map: previousTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const nextTexture = arrowTexture('next')
  const nextMaterial = new THREE.MeshBasicMaterial({
    map: nextTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })

  const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial)
  frame.renderOrder = 5

  const page = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pageMaterial)
  page.position.z = 0.001
  page.renderOrder = 6

  const close = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), closeMaterial)
  close.position.z = 0.002
  close.renderOrder = 7

  const previous = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), previousMaterial)
  previous.position.z = 0.002
  previous.renderOrder = 7
  previous.visible = false

  const next = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), nextMaterial)
  next.position.z = 0.002
  next.renderOrder = 7

  object.add(frame, page, close, previous, next)

  const controls = new Map<THREE.Object3D, ControlId>([
    [previous, 'previous'],
    [next, 'next'],
    [close, 'close'],
  ])
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const worldPosition = new THREE.Vector3()
  const worldQuaternion = new THREE.Quaternion()
  const forward = new THREE.Vector3()

  const pageTextures: Array<THREE.Texture | null> = [null, null]
  const pageAspects: number[] = [...PAGE_ASPECTS]

  let disposed = false
  let pageIndex = 0
  let hoveredControl: ControlId | null = null
  let dwell = 0
  let fade = 0
  let pointerDown = false
  let pointerDownX = 0
  let pointerDownY = 0

  const applyOpacity = (value: number): void => {
    frameMaterial.opacity = value
    pageMaterial.opacity = value
    closeMaterial.opacity = value
    previousMaterial.opacity = value
    nextMaterial.opacity = value
  }

  const layout = (): void => {
    const viewHeight =
      2 * PANEL_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    const viewWidth = viewHeight * camera.aspect

    let pageHeight = viewHeight * PAGE_HEIGHT_RATIO
    let pageWidth = pageHeight * pageAspects[pageIndex]
    const maxWidth = viewWidth * PAGE_WIDTH_RATIO
    if (pageWidth > maxWidth) {
      pageWidth = maxWidth
      pageHeight = pageWidth / pageAspects[pageIndex]
    }

    page.scale.set(pageWidth, pageHeight, 1)
    frame.scale.set(pageWidth + FRAME_PADDING * 2, pageHeight + FRAME_PADDING * 2, 1)

    const closeHeight = THREE.MathUtils.clamp(pageHeight * 0.08, 0.05, 0.085)
    const closeWidth = closeHeight * CLOSE_ASPECT
    close.scale.set(closeWidth, closeHeight, 1)
    close.position.y = pageHeight / 2 + FRAME_PADDING + CLOSE_GAP + closeHeight / 2

    const arrowX = pageWidth / 2 + FRAME_PADDING / 2
    previous.scale.set(closeHeight, closeHeight, 1)
    previous.position.set(-arrowX, 0, 0.002)
    next.scale.set(closeHeight, closeHeight, 1)
    next.position.set(arrowX, 0, 0.002)
  }

  const clearControlGaze = (): void => {
    hoveredControl = null
    dwell = 0
    reticle.setProgress(0)
    reticle.setPrompt(null)
  }

  const showPage = (index: number): void => {
    pageIndex = index
    const texture = pageTextures[pageIndex] ?? placeholderTexture
    if (pageMaterial.map !== texture) {
      pageMaterial.map = texture
      pageMaterial.needsUpdate = true
    }
    previous.visible = pageIndex === 1
    next.visible = pageIndex === 0
    clearControlGaze()
    layout()
  }

  const hide = (): void => {
    object.visible = false
    hoveredControl = null
    dwell = 0
    fade = 0
    pointerDown = false
    applyOpacity(0)
    reticle.setProgress(0)
    reticle.setPrompt(null)
  }

  const open = (): void => {
    camera.updateWorldMatrix(true, false)
    camera.getWorldPosition(worldPosition)
    camera.getWorldQuaternion(worldQuaternion)
    forward.set(0, 0, -1).applyQuaternion(worldQuaternion)

    object.position.copy(worldPosition).addScaledVector(forward, PANEL_DISTANCE)
    object.quaternion.copy(worldQuaternion)
    object.visible = true
    fade = 0
    pointerDown = false
    applyOpacity(0)
    showPage(0)
  }

  const requestClose = (): void => {
    if (!object.visible) return
    hide()
    onClose()
  }

  const visibleControls = (): THREE.Object3D[] => {
    const result: THREE.Object3D[] = []
    for (const [mesh] of controls) {
      if (mesh.visible) result.push(mesh)
    }
    return result
  }

  const update = (delta: number): void => {
    if (!object.visible) return

    layout()
    if (fade < 1) {
      fade = Math.min(1, fade + delta / OPEN_FADE_SECONDS)
      applyOpacity(fade)
    }

    camera.updateWorldMatrix(true, false)
    object.updateMatrixWorld(true)
    raycaster.setFromCamera(ORIGIN, camera)
    const hits = raycaster.intersectObjects(visibleControls(), false)
    const control = hits.length > 0 ? controls.get(hits[0].object) ?? null : null

    if (control !== hoveredControl) {
      hoveredControl = control
      dwell = 0
    }

    if (!hoveredControl) {
      reticle.setProgress(0)
      reticle.setPrompt(null)
      return
    }

    reticle.setPrompt(CONTROL_PROMPTS[hoveredControl])
    dwell += delta
    reticle.setProgress(Math.min(dwell / CONTROL_DWELL, 1))
    if (dwell < CONTROL_DWELL) return

    if (hoveredControl === 'close') {
      requestClose()
      return
    }
    showPage(hoveredControl === 'next' ? 1 : 0)
  }

  const handlePointerDown = (event: PointerEvent): void => {
    if (!object.visible || event.button !== 0) return
    pointerDown = true
    pointerDownX = event.clientX
    pointerDownY = event.clientY
  }

  const handlePointerUp = (event: PointerEvent): void => {
    if (!object.visible || event.button !== 0 || !pointerDown) return
    pointerDown = false
    if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > CLICK_SLOP) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    camera.updateWorldMatrix(true, false)
    object.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(visibleControls(), false)
    const control = hits.length > 0 ? controls.get(hits[0].object) ?? null : null
    if (!control) return

    if (control === 'close') {
      hide()
      window.setTimeout(onClose, 0)
      return
    }
    showPage(control === 'next' ? 1 : 0)
  }

  const handlePointerCancel = (): void => {
    pointerDown = false
  }

  const loader = new THREE.TextureLoader()
  PAGE_URLS.forEach((url, index) => {
    loader.load(
      url,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        pageTextures[index] = texture

        const image = texture.image as HTMLImageElement | undefined
        if (image && image.width > 0 && image.height > 0) {
          pageAspects[index] = image.width / image.height
        }
        if (index === pageIndex) {
          pageMaterial.map = texture
          pageMaterial.needsUpdate = true
          layout()
        }
      },
      undefined,
      (error: unknown) => {
        console.warn(`Newspaper: failed to load ${url}`, error)
      },
    )
  })

  canvas.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerCancel)

  const dispose = (): void => {
    disposed = true
    canvas.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
    object.removeFromParent()
    frame.geometry.dispose()
    page.geometry.dispose()
    close.geometry.dispose()
    previous.geometry.dispose()
    next.geometry.dispose()
    frameMaterial.dispose()
    pageMaterial.dispose()
    closeMaterial.dispose()
    previousMaterial.dispose()
    nextMaterial.dispose()
    frameTexture.dispose()
    closeTexture.dispose()
    previousTexture.dispose()
    nextTexture.dispose()
    placeholderTexture.dispose()
    for (const texture of pageTextures) texture?.dispose()
  }

  return {
    object,
    open,
    close: hide,
    isOpen: () => object.visible,
    update,
    dispose,
  }
}
