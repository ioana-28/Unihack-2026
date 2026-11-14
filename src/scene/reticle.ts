import * as THREE from 'three'

const RETICLE_COLOR = '#f4c583'
const PROGRESS_SIZE = 128
const PROGRESS_RADIUS = 50
const PROGRESS_LINE = 6
const PROMPT_WIDTH = 512
const PROMPT_HEIGHT = 96
const NAV_WIDTH = 1024
const NAV_HEIGHT = 320
const NAV_PLANE_WIDTH = 0.56
const NAV_PLANE_HEIGHT = (NAV_PLANE_WIDTH * NAV_HEIGHT) / NAV_WIDTH
const NAV_OFFSET_Y = -0.1125
const NAV_BAR_X = 80
const NAV_BAR_Y = 206
const NAV_BAR_WIDTH = NAV_WIDTH - NAV_BAR_X * 2
const NAV_BAR_HEIGHT = 58
const NAV_BAR_PLANE_LEFT = (NAV_BAR_X / NAV_WIDTH - 0.5) * NAV_PLANE_WIDTH
const NAV_BAR_PLANE_WIDTH = (NAV_BAR_WIDTH / NAV_WIDTH) * NAV_PLANE_WIDTH
const NAV_BAR_PLANE_HEIGHT = (NAV_BAR_HEIGHT / NAV_HEIGHT) * NAV_PLANE_HEIGHT
const NAV_BAR_PLANE_Y =
  (0.5 - (NAV_BAR_Y + NAV_BAR_HEIGHT / 2) / NAV_HEIGHT) * NAV_PLANE_HEIGHT

export type Reticle = {
  group: THREE.Group
  setProgress: (progress: number) => void
  setPrompt: (text: string | null) => void
  setNavigation: (label: string | null, progress: number) => void
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

  const navCanvas = createCanvas(NAV_WIDTH, NAV_HEIGHT)
  const navMaterial = new THREE.MeshBasicMaterial({
    map: navCanvas.texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const navGroup = new THREE.Group()
  navGroup.position.set(0, NAV_OFFSET_Y, 0)
  navGroup.visible = false

  const nav = new THREE.Mesh(
    new THREE.PlaneGeometry(NAV_PLANE_WIDTH, NAV_PLANE_HEIGHT),
    navMaterial,
  )
  nav.renderOrder = 13
  navGroup.add(nav)

  const navFillMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4c583,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const navFill = new THREE.Mesh(
    new THREE.PlaneGeometry(NAV_BAR_PLANE_WIDTH, NAV_BAR_PLANE_HEIGHT),
    navFillMaterial,
  )
  navFill.position.set(NAV_BAR_PLANE_LEFT + NAV_BAR_PLANE_WIDTH / 2, NAV_BAR_PLANE_Y, 0)
  navFill.renderOrder = 14
  navFill.visible = false
  navGroup.add(navFill)

  group.add(ring, dot, progress, prompt, navGroup)

  let lastProgress = -1
  let currentPrompt: string | null = null
  let currentNavigation: string | null = null

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

  const drawNavigation = (label: string): void => {
    const ctx = navCanvas.ctx
    const { width, height } = navCanvas.canvas
    ctx.clearRect(0, 0, width, height)

    roundedRect(ctx, 5, 5, width - 10, height - 10, 48)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.85)'
    ctx.lineWidth = 5
    ctx.stroke()

    let fontSize = 100
    do {
      ctx.font = `700 ${fontSize}px system-ui, "Segoe UI", sans-serif`
      fontSize -= 4
    } while (ctx.measureText(label).width > width - 120 && fontSize >= 40)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f7eeda'
    ctx.fillText(label, width / 2, 112)

    const radius = NAV_BAR_HEIGHT / 2
    ctx.fillStyle = 'rgba(243, 232, 211, 0.22)'
    roundedRect(ctx, NAV_BAR_X, NAV_BAR_Y, NAV_BAR_WIDTH, NAV_BAR_HEIGHT, radius)
    ctx.fill()
  }

  const setNavigation = (label: string | null, value: number): void => {
    if (!label) {
      currentNavigation = null
      navGroup.visible = false
      navFill.visible = false
      return
    }

    if (label !== currentNavigation) {
      currentNavigation = label
      drawNavigation(label)
      navCanvas.texture.needsUpdate = true
    }

    const clamped = THREE.MathUtils.clamp(value, 0, 1)
    navFill.visible = clamped > 0
    navFill.scale.x = clamped
    navFill.position.x = NAV_BAR_PLANE_LEFT + (NAV_BAR_PLANE_WIDTH * clamped) / 2
    navGroup.visible = true
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
    nav.geometry.dispose()
    navMaterial.dispose()
    navCanvas.texture.dispose()
    navFill.geometry.dispose()
    navFillMaterial.dispose()
  }

  return { group, setProgress, setPrompt, setNavigation, dispose }
}
