import * as THREE from 'three'

// Two gaze cards shown over the day 18 peephole. The cards sit left and right
// of the peephole panel, use a 2 s dwell, and show their own fill progress.

const DWELL_SECONDS = 2
const CARD_CANVAS_W = 512
const CARD_CANVAS_H = 224
const CARD_GAP = 0.03
const PEEPHOLE_DISTANCE = 0.85
const PEEPHOLE_RADIUS = 0.44
const ORIGIN = new THREE.Vector2(0, 0)

export type ChoiceCards = {
  show: () => void
  hide: () => void
  update: (camera: THREE.Camera, delta: number) => 0 | 1 | null
  dispose: () => void
}

type Card = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  texture: THREE.CanvasTexture
  ctx: CanvasRenderingContext2D
  label: string
  progress: number
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

function makeCard(label: string): Card {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_CANVAS_W
  canvas.height = CARD_CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const card: Card = {
    mesh: new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    ),
    texture,
    ctx,
    label,
    progress: 0,
  }
  card.mesh.renderOrder = 41
  card.mesh.visible = false
  return card
}

function drawCard(card: Card): void {
  const { ctx, label } = card
  const width = CARD_CANVAS_W
  const height = CARD_CANVAS_H
  ctx.clearRect(0, 0, width, height)

  roundedRect(ctx, 3, 3, width - 6, height - 6, 28)
  ctx.fillStyle = 'rgba(9, 9, 8, 0.9)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(224, 160, 68, 0.72)'
  ctx.lineWidth = 4
  ctx.stroke()

  let fontSize = 40
  let lines: string[] = []
  do {
    ctx.font = `600 ${fontSize}px system-ui, "Segoe UI", sans-serif`
    lines = wrap(ctx, label, width - 70)
    fontSize -= 2
  } while ((lines.length > 3 || lines.length * fontSize * 1.22 > height - 78) && fontSize > 22)
  fontSize += 2
  const lineHeight = fontSize * 1.22
  const blockHeight = lines.length * lineHeight
  const top = (height - 26 - blockHeight) / 2 + lineHeight / 2

  ctx.fillStyle = '#f3e8d3'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => ctx.fillText(line, width / 2, top + index * lineHeight))

  if (card.progress > 0) {
    ctx.fillStyle = 'rgba(244, 197, 131, 0.45)'
    ctx.fillRect(18, height - 24, (width - 36) * THREE.MathUtils.clamp(card.progress, 0, 1), 8)
  }
  card.texture.needsUpdate = true
}

export function createChoiceCards(
  parent: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  labels: [string, string],
): ChoiceCards {
  const left = makeCard(labels[0])
  const right = makeCard(labels[1])
  parent.add(left.mesh, right.mesh)

  const viewHeight =
    2 * PEEPHOLE_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
  const viewWidth = viewHeight * camera.aspect
  const cardWidth = Math.min(0.45, viewWidth * 0.4)
  const cardHeight = (cardWidth * CARD_CANVAS_H) / CARD_CANVAS_W
  const x = Math.min(
    viewWidth / 2 - cardWidth / 2 - CARD_GAP,
    PEEPHOLE_RADIUS + cardWidth / 2 + CARD_GAP,
  )
  left.mesh.scale.set(cardWidth, cardHeight, 1)
  left.mesh.position.set(-x, 0, 0.03)
  right.mesh.scale.set(cardWidth, cardHeight, 1)
  right.mesh.position.set(x, 0, 0.03)

  const raycaster = new THREE.Raycaster()
  let leftDwell = 0
  let rightDwell = 0
  let shown = false

  const setProgress = (card: Card, value: number): void => {
    const rounded = Math.round(value * 100) / 100
    if (rounded === card.progress) return
    card.progress = rounded
    drawCard(card)
  }

  const reset = (): void => {
    leftDwell = 0
    rightDwell = 0
    setProgress(left, 0)
    setProgress(right, 0)
  }

  return {
    show() {
      shown = true
      reset()
      left.mesh.visible = true
      right.mesh.visible = true
      drawCard(left)
      drawCard(right)
    },
    hide() {
      shown = false
      reset()
      left.mesh.visible = false
      right.mesh.visible = false
    },
    update(activeCamera, delta) {
      if (!shown) return null
      const perspectiveCamera = activeCamera as THREE.PerspectiveCamera
      perspectiveCamera.updateWorldMatrix(true, false)
      parent.updateMatrixWorld(true)
      raycaster.setFromCamera(ORIGIN, perspectiveCamera)
      const hits = raycaster.intersectObjects([left.mesh, right.mesh], false)
      const hit = hits.length > 0 ? hits[0].object : null

      if (hit === left.mesh) {
        leftDwell += delta
        rightDwell = 0
        setProgress(right, 0)
        setProgress(left, leftDwell / DWELL_SECONDS)
        return leftDwell >= DWELL_SECONDS ? 0 : null
      }
      if (hit === right.mesh) {
        rightDwell += delta
        leftDwell = 0
        setProgress(left, 0)
        setProgress(right, rightDwell / DWELL_SECONDS)
        return rightDwell >= DWELL_SECONDS ? 1 : null
      }

      reset()
      return null
    },
    dispose() {
      parent.remove(left.mesh, right.mesh)
      left.mesh.geometry.dispose()
      left.mesh.material.dispose()
      left.texture.dispose()
      right.mesh.geometry.dispose()
      right.mesh.material.dispose()
      right.texture.dispose()
    },
  }
}
