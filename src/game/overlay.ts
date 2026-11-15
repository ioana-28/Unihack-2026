import * as THREE from 'three'

// Text and fades drawn by code (CONTEXT §9): subtitles and hints at the bottom
// of the view, centered on-screen text, the date title, and a fade to black.
// Text panels follow the head with a slight lag; the fade is head-locked.

type Style = 'subtitrare' | 'indiciu' | 'text' | 'titlu'

const CANVAS_W = 1536
const CANVAS_H = 384
const DISTANCE = 2
const PANEL_W = 1.5
const BOTTOM_Y = -0.5
const FOLLOW = 5
const FADE_ORDER = 90
const TEXT_ORDER = 96

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

class TextPanel {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private hideAt = 0
  private readonly style: Style

  constructor(style: Style) {
    this.style = style
    this.canvas.width = CANVAS_W
    this.canvas.height = CANVAS_H
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
    const width = style === 'titlu' ? PANEL_W * 1.2 : PANEL_W
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * CANVAS_H) / CANVAS_W), material)
    this.mesh.renderOrder = TEXT_ORDER + (style === 'subtitrare' ? 1 : 0)
    this.mesh.visible = false
    this.mesh.position.y = style === 'subtitrare' || style === 'indiciu' ? BOTTOM_Y : 0
  }

  get visible(): boolean {
    return this.mesh.visible
  }

  show(text: string, seconds: number): void {
    this.draw(text)
    this.mesh.visible = true
    this.hideAt = performance.now() + seconds * 1000
  }

  hide(): void {
    this.mesh.visible = false
    this.hideAt = 0
  }

  update(): void {
    if (this.mesh.visible && this.hideAt > 0 && performance.now() >= this.hideAt) this.hide()
  }

  private draw(text: string): void {
    const { ctx } = this
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    const sizes: Record<Style, number> = { subtitrare: 78, indiciu: 70, text: 78, titlu: 96 }
    let size = sizes[this.style]
    const font = (px: number): string =>
      this.style === 'indiciu'
        ? `italic 400 ${px}px system-ui, "Segoe UI", sans-serif`
        : this.style === 'titlu'
          ? `400 ${px}px Georgia, "Times New Roman", serif`
          : `500 ${px}px system-ui, "Segoe UI", sans-serif`
    let lines: string[]
    do {
      ctx.font = font(size)
      lines = wrap(ctx, text, CANVAS_W - 140)
      size -= 4
    } while (lines.length * size * 1.3 > CANVAS_H - 60 && size > 28)
    size += 4
    const lineHeight = size * 1.3
    const blockH = lines.length * lineHeight

    if (this.style !== 'titlu') {
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
      const boxW = Math.min(CANVAS_W - 20, widest + 90)
      const boxH = blockH + 50
      ctx.fillStyle = this.style === 'indiciu' ? 'rgba(20, 20, 22, 0.55)' : 'rgba(8, 8, 8, 0.72)'
      ctx.beginPath()
      ctx.roundRect((CANVAS_W - boxW) / 2, (CANVAS_H - boxH) / 2, boxW, boxH, 22)
      ctx.fill()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = this.style === 'indiciu' ? '#c9c9c9' : '#f3eee4'
    const top = (CANVAS_H - blockH) / 2 + lineHeight / 2
    lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, top + i * lineHeight))
    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}

export class Overlay {
  /** Follows the head with lag; holds the text panels. */
  readonly root = new THREE.Group()
  readonly subtitle = new TextPanel('subtitrare')
  readonly hint = new TextPanel('indiciu')
  readonly text = new TextPanel('text')
  readonly title = new TextPanel('titlu')
  private readonly fadeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  private fadeFrom = 0
  private fadeTo = 0
  private fadeStart = 0
  private fadeDuration = 0
  private fadeDone: (() => void) | null = null
  private readonly camera: THREE.Camera
  private readonly camPos = new THREE.Vector3()
  private readonly camQuat = new THREE.Quaternion()
  private readonly offset = new THREE.Vector3()
  private placed = false

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera
    this.root.name = 'overlay'
    this.root.add(this.subtitle.mesh, this.hint.mesh, this.text.mesh, this.title.mesh)
    scene.add(this.root)

    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    )
    this.fadeMesh.renderOrder = FADE_ORDER
    this.fadeMesh.visible = false
    camera.add(this.fadeMesh)
  }

  /** Fade to black (1) or back to the scene (0). */
  fade(to: 0 | 1, seconds: number): Promise<void> {
    this.fadeDone?.()
    this.fadeFrom = this.fadeMesh.material.opacity
    this.fadeTo = to
    this.fadeStart = performance.now()
    this.fadeDuration = Math.max(0.001, seconds) * 1000
    this.fadeMesh.visible = true
    return new Promise((resolve) => {
      this.fadeDone = resolve
    })
  }

  setBlack(black: boolean): void {
    this.fadeDone?.()
    this.fadeDone = null
    this.fadeDuration = 0
    this.fadeMesh.material.opacity = black ? 1 : 0
    this.fadeMesh.visible = black
  }

  clearText(): void {
    this.subtitle.hide()
    this.hint.hide()
    this.text.hide()
    this.title.hide()
  }

  update(delta: number): void {
    if (this.fadeDuration > 0) {
      const t = Math.min(1, (performance.now() - this.fadeStart) / this.fadeDuration)
      this.fadeMesh.material.opacity = this.fadeFrom + (this.fadeTo - this.fadeFrom) * t
      if (t >= 1) {
        this.fadeDuration = 0
        this.fadeMesh.visible = this.fadeTo > 0
        const done = this.fadeDone
        this.fadeDone = null
        done?.()
      }
    }

    this.subtitle.update()
    this.hint.update()
    this.text.update()
    this.title.update()

    this.camera.getWorldPosition(this.camPos)
    this.camera.getWorldQuaternion(this.camQuat)
    if (!this.placed) {
      this.root.quaternion.copy(this.camQuat)
      this.placed = true
    } else {
      this.root.quaternion.slerp(this.camQuat, 1 - Math.exp(-FOLLOW * delta))
    }
    this.offset.set(0, 0, -DISTANCE).applyQuaternion(this.root.quaternion)
    this.root.position.copy(this.camPos).add(this.offset)
  }

  /** Snap to the current view (after a teleport or at day start). */
  snap(): void {
    this.placed = false
  }

  dispose(): void {
    this.subtitle.dispose()
    this.hint.dispose()
    this.text.dispose()
    this.title.dispose()
    this.fadeMesh.geometry.dispose()
    this.fadeMesh.material.dispose()
  }
}
