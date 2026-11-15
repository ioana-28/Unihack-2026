import * as THREE from 'three'
import { canvasTexture } from '../textures'
import { assetUrl } from './days'

// Day 18 newspaper close-up. It is a world-fixed panel with a translucent
// frame, so the room stays visible around the page. It closes after the player
// has looked outside the panel for two seconds.

const PAGE_ASPECT = 512 / 732
const PANEL_DISTANCE = 1.15
const PAGE_HEIGHT_RATIO = 0.68
const PAGE_WIDTH_RATIO = 0.82
const FRAME_PADDING = 0.05
const LOOK_AWAY_SECONDS = 2
const OPEN_FADE_SECONDS = 0.18
const ORIGIN = new THREE.Vector2(0, 0)

export type NewspaperCloseup = {
  open: (src: string) => void
  close: () => void
  isOpen: () => boolean
  /** Returns true when the panel just closed because the player looked away. */
  update: (delta: number) => boolean
  dispose: () => void
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

function makeFallback(): THREE.CanvasTexture {
  return canvasTexture(512, 732, (ctx, width, height) => {
    ctx.fillStyle = '#e8dfc8'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#171410'
    ctx.textAlign = 'center'
    ctx.font = '700 58px Georgia, "Times New Roman", serif'
    ctx.fillText('SCÎNTEIA', width / 2, 76)
    ctx.font = 'italic 16px Georgia, "Times New Roman", serif'
    ctx.fillText('ORGAN AL COMITETULUI CENTRAL AL P.C.R.', width / 2, 112)
    ctx.fillStyle = '#8e2f21'
    ctx.fillRect(36, 132, width - 72, 3)
    ctx.fillStyle = '#171410'
    ctx.font = '600 22px Georgia, "Times New Roman", serif'
    ctx.fillText('Marți, 18 decembrie 1989', width / 2, 164)
    ctx.font = '700 30px Georgia, "Times New Roman", serif'
    const headline = [
      'TOVARĂȘUL NICOLAE',
      'CEAUȘESCU A PLECAT',
      'ÎNTR-O VIZITĂ OFICIALĂ',
      'ÎN IRAN',
    ]
    headline.forEach((line, index) => ctx.fillText(line, width / 2, 232 + index * 42))
    ctx.fillStyle = 'rgba(23, 20, 16, 0.2)'
    for (let line = 0; line < 24; line += 1) {
      const y = 430 + line * 10
      ctx.fillRect(36, y, line % 3 === 0 ? width - 72 : width - 120, 2)
    }
    ctx.fillStyle = 'rgba(23, 20, 16, 0.14)'
    ctx.fillRect(36, 690, width - 72, 2)
  })
}

export function createNewspaperCloseup(camera: THREE.PerspectiveCamera): NewspaperCloseup {
  const group = new THREE.Group()
  group.name = 'day18_ziar'
  group.visible = false
  let page: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  let frame: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  let fallback: THREE.CanvasTexture | null = null
  let loadedTexture: THREE.Texture | null = null
  let frameTexture: THREE.Texture | null = null
  let pageAspect = PAGE_ASPECT
  let outside = 0
  let fade = 0
  let disposed = false
  let open = false

  const raycaster = new THREE.Raycaster()

  const disposePanel = (): void => {
    if (!page || !frame) return
    group.remove(page, frame)
    page.geometry.dispose()
    page.material.dispose()
    frame.geometry.dispose()
    frame.material.dispose()
    frameTexture?.dispose()
    fallback?.dispose()
    loadedTexture?.dispose()
    frameTexture = null
    fallback = null
    loadedTexture = null
    page = null
    frame = null
  }

  const close = (): void => {
    if (!open) return
    open = false
    outside = 0
    fade = 0
    group.visible = false
    disposePanel()
  }

  const openPanel = (src: string): void => {
    if (disposed) return
    close()
    open = true
    outside = 0
    fade = 0
    pageAspect = PAGE_ASPECT
    fallback = makeFallback()

    frameTexture = canvasTexture(512, Math.round(512 / PAGE_ASPECT), (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height)
      roundedRect(ctx, 3, 3, width - 6, height - 6, 34)
      ctx.fillStyle = 'rgba(8, 7, 6, 0.46)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(224, 160, 68, 0.58)'
      ctx.lineWidth = 3
      ctx.stroke()
    })
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
      map: fallback,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
    frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial)
    frame.renderOrder = 5
    page = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pageMaterial)
    page.position.z = 0.001
    page.renderOrder = 6
    group.add(frame, page)

    const parent = camera.parent ?? camera
    if (group.parent !== parent) parent.add(group)
    group.position.copy(camera.position)
    group.quaternion.copy(camera.quaternion)
    group.translateZ(-PANEL_DISTANCE)
    group.visible = true

    new THREE.TextureLoader().load(
      assetUrl(src),
      (texture) => {
        if (!open || disposed || !page) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        const image = texture.image as HTMLImageElement | undefined
        if (image && image.width > 0 && image.height > 0) {
          pageAspect = image.width / image.height
        }
        loadedTexture?.dispose()
        loadedTexture = texture
        page.material.map = texture
        page.material.needsUpdate = true
      },
      undefined,
      () => console.warn(`[day18] Missing newspaper image "${src}"; using the fallback front page.`),
    )
  }

  const layout = (): void => {
    if (!page || !frame) return
    const viewHeight =
      2 * PANEL_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    const viewWidth = viewHeight * camera.aspect
    let pageHeight = viewHeight * PAGE_HEIGHT_RATIO
    let pageWidth = pageHeight * pageAspect
    const maxWidth = viewWidth * PAGE_WIDTH_RATIO
    if (pageWidth > maxWidth) {
      pageWidth = maxWidth
      pageHeight = pageWidth / pageAspect
    }
    page.scale.set(pageWidth, pageHeight, 1)
    frame.scale.set(pageWidth + FRAME_PADDING * 2, pageHeight + FRAME_PADDING * 2, 1)
  }

  const update = (delta: number): boolean => {
    if (!open || !page || !frame) return false
    layout()
    if (fade < 1) {
      fade = Math.min(1, fade + delta / OPEN_FADE_SECONDS)
      page.material.opacity = fade
      frame.material.opacity = fade
    }

    camera.updateWorldMatrix(true, false)
    group.updateMatrixWorld(true)
    raycaster.setFromCamera(ORIGIN, camera)
    const hit = raycaster.intersectObjects([page, frame], false).length > 0
    outside = hit ? 0 : outside + delta
    if (outside < LOOK_AWAY_SECONDS) return false
    close()
    return true
  }

  const dispose = (): void => {
    disposed = true
    close()
    group.removeFromParent()
  }

  return {
    open: openPanel,
    close,
    isOpen: () => open,
    update,
    dispose,
  }
}
