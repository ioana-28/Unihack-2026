import * as THREE from 'three'
import { assetUrl } from '../days'
import type { ActionContext } from '../runner'

// Helpers shared by the day-17 actions. These modules do their own gaze
// checks (the runner's room lock stays on while they run).

export const DWELL = 1.5
const CENTER = new THREE.Vector2(0, 0)
const raycaster = new THREE.Raycaster()

/** Model node by its name in the GLB (sanitized like GLTFLoader does). */
export function modelNode(ctx: ActionContext, name: string): THREE.Object3D | null {
  const room = ctx.deps.room
  return room.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? room.getObjectByName(name) ?? null
}

function isVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

export function isUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node === root) return true
  }
  return false
}

/** Nearest visible object at the view center (walls occlude). `extra` = meshes outside the room. */
export function gazeHit(ctx: ActionContext, extra: THREE.Object3D[] = []): THREE.Object3D | null {
  ctx.deps.camera.updateMatrixWorld()
  raycaster.setFromCamera(CENTER, ctx.deps.camera)
  for (const hit of raycaster.intersectObjects([ctx.deps.room, ...extra], true)) {
    if (isVisible(hit.object)) return hit.object
  }
  return null
}

/** Is the view center on this mesh? (no occlusion: for panels drawn over everything) */
export function looksAt(ctx: ActionContext, object: THREE.Object3D): boolean {
  if (!isVisible(object)) return false
  ctx.deps.camera.updateMatrixWorld()
  raycaster.setFromCamera(CENTER, ctx.deps.camera)
  return raycaster.intersectObject(object, true).length > 0
}

/** Bounds in model coordinates. */
export function modelBounds(ctx: ActionContext, object: THREE.Object3D): THREE.Box3 {
  const space = ctx.deps.room
  space.updateWorldMatrix(true, false)
  object.updateWorldMatrix(true, true)
  const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert()
  const box = new THREE.Box3()
  const relative = new THREE.Matrix4()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.computeBoundingBox()
    if (!child.geometry.boundingBox) return
    relative.multiplyMatrices(toSpace, child.matrixWorld)
    box.union(child.geometry.boundingBox.clone().applyMatrix4(relative))
  })
  return box
}

// ---------- Dwell ring at the view center (the teammates' reticle is not reachable from here)

let ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
let ringValue = -1

export function setDwellRing(ctx: ActionContext, progress: number): void {
  if (!ring) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.026, 40, 1, Math.PI / 2, 0.001),
      new THREE.MeshBasicMaterial({
        color: 0xf4c583,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    )
    ring.renderOrder = 15
    ring.position.set(0, 0, -1)
  }
  if (ring.parent !== ctx.deps.camera) ctx.deps.camera.add(ring)
  const value = Math.round(THREE.MathUtils.clamp(progress, 0, 1) * 50) / 50
  ring.visible = value > 0
  if (value === ringValue || value <= 0) return
  ringValue = value
  ring.geometry.dispose()
  ring.geometry = new THREE.RingGeometry(0.02, 0.026, 40, 1, Math.PI / 2, -Math.PI * 2 * value)
}

export type GazeOptions = {
  /** Gaze only counts while this is true (e.g. "player is in the kitchen"). */
  allowed?: () => boolean
  /** true = hits must be the nearest visible thing (room occludes). Default true. */
  occlusion?: boolean
  extra?: THREE.Object3D[]
  seconds?: number
  onProgress?: (progress: number) => void
}

/** Resolves once the player has gazed at one of `targets` for the dwell time. */
export async function waitForGaze(
  ctx: ActionContext,
  targets: THREE.Object3D[],
  options: GazeOptions = {},
): Promise<THREE.Object3D> {
  const seconds = options.seconds ?? DWELL
  let dwell = 0
  let current: THREE.Object3D | null = null
  try {
    for (;;) {
      await ctx.wait(0.1)
      let hit: THREE.Object3D | null = null
      if (!options.allowed || options.allowed()) {
        if (options.occlusion === false) {
          hit = targets.find((t) => looksAt(ctx, t)) ?? null
        } else {
          const first = gazeHit(ctx, options.extra)
          hit = (first && targets.find((t) => isUnder(first, t))) ?? null
        }
      }
      dwell = hit && hit === current ? dwell + 0.1 : 0
      current = hit
      const progress = dwell / seconds
      setDwellRing(ctx, progress)
      options.onProgress?.(progress)
      if (hit && dwell >= seconds) return hit
    }
  } finally {
    setDwellRing(ctx, 0)
    options.onProgress?.(0)
  }
}

/** Soft pulse on a model object until the returned function is called. */
export function glowWhile(ctx: ActionContext, object: THREE.Object3D | null): () => void {
  if (!object) return () => undefined
  const stopFrame = ctx.onFrame((time) => {
    ctx.deps.fx.setGlow(object, 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.6)))
  })
  return () => {
    stopFrame()
    ctx.deps.fx.setGlow(object, 0)
  }
}

/** Repeating hint (5 s, bottom of the view) until stopped; waits while subtitles show. */
export function repeatHint(
  ctx: ActionContext,
  text: string,
  first = 0,
  repeat: number | null = null,
): () => void {
  const { overlay } = ctx.deps
  let next = performance.now() / 1000 + first
  let shown = false
  const stopFrame = ctx.onFrame(() => {
    const t = performance.now() / 1000
    if (t < next || overlay.subtitle.visible || overlay.text.visible || overlay.hint.visible) return
    overlay.hint.show(text, 5)
    shown = true
    next = repeat ? t + repeat : Number.POSITIVE_INFINITY
  })
  return () => {
    stopFrame()
    if (shown) overlay.hint.hide()
  }
}

// ---------- Red banner text (17.4a), follows the head with the overlay

export function redBanner(ctx: ActionContext, text: string): () => void {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 256
  const c = canvas.getContext('2d')
  if (c) {
    c.fillStyle = 'rgba(10, 0, 0, 0.6)'
    c.beginPath()
    c.roundRect(40, 40, canvas.width - 80, canvas.height - 80, 24)
    c.fill()
    c.fillStyle = '#ff3b30'
    c.font = '700 76px system-ui, "Segoe UI", sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 140)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.25),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  )
  mesh.renderOrder = 98
  mesh.position.set(0, 0.32, 0)
  ctx.deps.overlay.root.add(mesh)
  const remove = (): void => {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    mesh.material.dispose()
    texture.dispose()
  }
  ctx.onCleanup(remove)
  return remove
}

// ---------- Media

export function loadImageTexture(src: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      assetUrl(src),
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        resolve(texture)
      },
      undefined,
      () => {
        console.warn(`[z17] Missing image "${src}".`)
        resolve(null)
      },
    )
  })
}

export type LoopVideo = { video: HTMLVideoElement; texture: THREE.VideoTexture }

/** Muted, looping, inline video; null if the file is missing. */
export function loadLoopVideo(src: string): Promise<LoopVideo | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' })
    video.setAttribute('playsinline', '')
    let settled = false
    const done = (value: LoopVideo | null): void => {
      if (settled) return
      settled = true
      if (!value) console.warn(`[z17] Missing video "${src}".`)
      resolve(value)
    }
    video.addEventListener(
      'loadeddata',
      () => {
        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace
        done({ video, texture })
      },
      { once: true },
    )
    video.addEventListener('error', () => done(null), { once: true })
    window.setTimeout(() => done(null), 5000)
    video.src = assetUrl(src)
    video.load()
  })
}

/** Dark peephole (round, black edges) used when the image is missing. */
export function darkPeephole(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const c = canvas.getContext('2d')
  if (c) {
    c.fillStyle = '#000'
    c.fillRect(0, 0, canvas.width, canvas.height)
    const g = c.createRadialGradient(320, 175, 10, 320, 180, 160)
    g.addColorStop(0, '#2a2620')
    g.addColorStop(0.85, '#0f0d0b')
    g.addColorStop(1, '#000')
    c.fillStyle = g
    c.beginPath()
    c.arc(320, 180, 160, 0, Math.PI * 2)
    c.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---------- Peephole panel: world space, in front of where the player looks

export class Peephole {
  private readonly group = new THREE.Group()
  private readonly panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly backdrop: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>

  constructor() {
    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(3, 32, 16),
      new THREE.MeshBasicMaterial({
        color: 0x020202,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.97,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    )
    this.backdrop.renderOrder = 6
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7 * (9 / 16)),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
    )
    this.panel.renderOrder = 7
    this.group.add(this.backdrop, this.panel)
    this.group.visible = false
  }

  open(ctx: ActionContext, texture: THREE.Texture): void {
    const camera = ctx.deps.camera
    const eye = camera.getWorldPosition(new THREE.Vector3())
    const forward = camera.getWorldDirection(new THREE.Vector3())
    this.backdrop.position.copy(eye)
    this.panel.position.copy(eye).addScaledVector(forward, 1.3)
    this.panel.lookAt(eye)
    this.show(texture)
    const scene = ctx.deps.overlay.root.parent
    scene?.add(this.group)
    this.group.visible = true
  }

  show(texture: THREE.Texture): void {
    this.panel.material.map = texture
    this.panel.material.needsUpdate = true
  }

  /** Width / height of the content (default 16:9); keeps the panel height. */
  setAspect(aspect: number): void {
    const height = 1.7 * (9 / 16)
    this.panel.scale.set((height * aspect) / 1.7, 1, 1)
  }

  isLookedAt(ctx: ActionContext): boolean {
    return this.group.visible && looksAt(ctx, this.panel)
  }

  close(): void {
    this.group.visible = false
    this.group.removeFromParent()
    this.panel.material.map = null
  }
}
