import * as THREE from 'three'

const RETICLE_COLOR = '#f4c583'
const PROGRESS_SIZE = 128
const PROGRESS_RADIUS = 50
const PROGRESS_LINE = 6
const PROMPT_WIDTH = 512
const PROMPT_HEIGHT = 96

export type Reticle = {
  group: THREE.Group
  setProgress: (progress: number) => void
  setPrompt: (text: string | null) => void
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

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
} {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, ctx, texture }
}

export function createReticle(): Reticle {
  const group = new THREE.Group()
  group.visible = false

  const baseMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4c583,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    depthWrite: false,
    fog: false,
  })

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.013, 0.0165, 40), baseMaterial)
  ring.renderOrder = 10
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 16), baseMaterial)
  dot.renderOrder = 10

  const progressCanvas = createCanvas(PROGRESS_SIZE, PROGRESS_SIZE)
  const progressMaterial = new THREE.MeshBasicMaterial({
    map: progressCanvas.texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const progress = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.042), progressMaterial)
  progress.renderOrder = 11
  progress.visible = false

  const promptCanvas = createCanvas(PROMPT_WIDTH, PROMPT_HEIGHT)
  const promptMaterial = new THREE.MeshBasicMaterial({
    map: promptCanvas.texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const prompt = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.04875), promptMaterial)
  prompt.position.set(0, -0.062, 0)
  prompt.renderOrder = 12
  prompt.visible = false

  group.add(ring, dot, progress, prompt)

  let lastProgress = -1
  let currentPrompt: string | null = null

  const drawProgress = (value: number): void => {
    const ctx = progressCanvas.ctx
    ctx.clearRect(0, 0, PROGRESS_SIZE, PROGRESS_SIZE)
    if (value <= 0) return
    const center = PROGRESS_SIZE / 2
    ctx.strokeStyle = RETICLE_COLOR
    ctx.lineWidth = PROGRESS_LINE
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(center, center, PROGRESS_RADIUS, -Math.PI / 2, -Math.PI / 2 + value * Math.PI * 2)
    ctx.stroke()
  }

  const setProgress = (value: number): void => {
    const clamped = THREE.MathUtils.clamp(value, 0, 1)
    const rounded = Math.round(clamped * 100)
    if (rounded !== lastProgress) {
      lastProgress = rounded
      drawProgress(clamped)
      progressCanvas.texture.needsUpdate = true
    }
    progress.visible = clamped > 0
  }

  const drawPrompt = (text: string): void => {
    const ctx = promptCanvas.ctx
    const { width, height } = promptCanvas.canvas
    ctx.clearRect(0, 0, width, height)

    roundedRect(ctx, 3, 3, width - 6, height - 6, 28)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.88)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.55)'
    ctx.lineWidth = 3
    ctx.stroke()

    let fontSize = 44
    do {
      ctx.font = `600 ${fontSize}px system-ui, "Segoe UI", sans-serif`
      fontSize -= 2
    } while (ctx.measureText(text).width > width - 56 && fontSize >= 22)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f3e8d3'
    ctx.fillText(text, width / 2, height / 2)
  }

  const setPrompt = (text: string | null): void => {
    if (text === currentPrompt) return
    currentPrompt = text
    if (!text) {
      prompt.visible = false
      return
    }
    drawPrompt(text)
    promptCanvas.texture.needsUpdate = true
    prompt.visible = true
  }

  const dispose = (): void => {
    ring.geometry.dispose()
    dot.geometry.dispose()
    baseMaterial.dispose()
    progress.geometry.dispose()
    progressMaterial.dispose()
    progressCanvas.texture.dispose()
    prompt.geometry.dispose()
    promptMaterial.dispose()
    promptCanvas.texture.dispose()
  }

  return { group, setProgress, setPrompt, dispose }
}
