import * as THREE from 'three'
import { mediaSrc } from '../preload'
import type { Lumina } from './types'

// Visual state of the apartment driven by the day: lighting, power cut,
// glow on active objects, the square behind the window, the TV screen.

const LIGHT_SCALE: Record<Lumina | 'bezna', { point: number; hemi: number }> = {
  zi: { point: 1, hemi: 1 },
  seara: { point: 0.8, hemi: 0.55 },
  noapte: { point: 0.55, hemi: 0.3 },
  bezna: { point: 0, hemi: 0.12 },
}
const GLOW_COLOR = new THREE.Color(0xf4c583)
const WINDOW_BEHIND = 3
const WINDOW_VIEW_HEIGHT = 5
const PASSIVE_DIM = 0.72
const STATIC_FPS = 14
const TV_VIEW_DISTANCE = 0.95
const TV_VIEW_EYE_ABOVE = 0.3
const TV_BUTTON_W = 0.3
const BUTTON_CANVAS_W = 512
const BUTTON_CANVAS_H = 160

type GlowSlot = { material: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }

const FACING = new THREE.Vector3(0, 0, 1)

/** Bounds of `object` in the coordinates of `space` (the room = model coordinates). */
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

export class RoomFx {
  private readonly lights: { light: THREE.Light; base: number; hemi: boolean }[] = []
  private readonly glow = new Map<THREE.Object3D, GlowSlot[]>()
  private windowView: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private windowSrc = ''
  private windowVideo: HTMLVideoElement | null = null
  private readonly windowTextures = new Map<string, Promise<THREE.Texture | null>>()
  private tvScreen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private tvButton: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private tvViewpoint: THREE.Vector3 | null = null
  private tvVideo: HTMLVideoElement | null = null
  private tvLabel = ''
  private tvProgress = -1
  private staticCanvas: HTMLCanvasElement | null = null
  private staticTexture: THREE.CanvasTexture | null = null
  private staticClock = 0
  private readonly buttonFace = (() => {
    const canvas = document.createElement('canvas')
    canvas.width = BUTTON_CANVAS_W
    canvas.height = BUTTON_CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return { ctx, texture }
  })()
  private readonly raycaster = new THREE.Raycaster()
  private lighting: Lumina = 'seara'
  private power = true
  private readonly room: THREE.Object3D

  constructor(room: THREE.Object3D) {
    this.room = room
    room.traverse((object) => {
      if (object instanceof THREE.HemisphereLight || object instanceof THREE.PointLight) {
        this.lights.push({ light: object, base: object.intensity, hemi: object instanceof THREE.HemisphereLight })
      }
    })
  }

  // ---------- Lighting and power

  setLighting(lighting: Lumina): void {
    this.lighting = lighting
    this.applyLights()
  }

  setPower(on: boolean): void {
    this.power = on
    this.applyLights()
  }

  hasPower(): boolean {
    return this.power
  }

  private applyLights(): void {
    const scale = LIGHT_SCALE[this.power ? this.lighting : 'bezna']
    for (const { light, base, hemi } of this.lights) {
      light.intensity = base * (hemi ? scale.hemi : scale.point)
    }
  }

  // ---------- Glow on active objects

  /** Soft emissive pulse; materials are cloned so the glow does not leak to other meshes. */
  setGlow(object: THREE.Object3D, amount: number): void {
    let slots = this.glow.get(object)
    if (!slots) {
      if (amount <= 0) return
      slots = []
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const list = Array.isArray(child.material) ? child.material : [child.material]
        const copies = list.map((material: THREE.Material) => {
          if (!(material instanceof THREE.MeshStandardMaterial)) return material
          const copy = material.clone()
          slots?.push({ material: copy, color: copy.emissive.clone(), intensity: copy.emissiveIntensity })
          return copy
        })
        child.material = Array.isArray(child.material) ? copies : copies[0]
      })
      this.glow.set(object, slots)
    }
    for (const slot of slots) {
      if (amount <= 0) {
        slot.material.emissive.copy(slot.color)
        slot.material.emissiveIntensity = slot.intensity
      } else {
        slot.material.emissive.copy(slot.color).lerp(GLOW_COLOR, Math.min(1, amount * 1.2))
        slot.material.emissiveIntensity = Math.max(slot.intensity, amount)
      }
    }
  }

  // ---------- Window: passive view of the square behind the glass

  /** `roomCenter` is in model coordinates (like states.json positions). */
  setupWindow(glass: THREE.Object3D | null, roomCenter: THREE.Vector3): void {
    if (!glass || this.windowView) return
    const box = bounds(glass, this.room)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    // The glass is thin along one horizontal axis; "outside" points away from the room.
    const axis = size.x < size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
    if (axis.dot(roomCenter.clone().sub(center)) > 0) axis.negate()

    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(PASSIVE_DIM, PASSIVE_DIM, PASSIVE_DIM), toneMapped: false, fog: false })
    const view = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    view.name = 'ecran_fereastra'
    view.position.copy(center).addScaledVector(axis, WINDOW_BEHIND)
    view.quaternion.setFromUnitVectors(FACING, axis.clone().negate())
    view.raycast = () => undefined
    this.room.add(view)
    this.windowView = view

    // Let the square show through the frosted glass.
    glass.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const list = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of list) {
        material.transparent = true
        material.opacity = 0.22
        material.depthWrite = false
      }
    })
  }

  /**
   * Shows the square behind the glass: the video if it exists, else the image.
   * `bright` = the player is looking out on purpose (full brightness);
   * otherwise the view is slightly dimmed (passive).
   */
  async setWindowView(src: string, options: { video?: string; bright?: boolean } = {}): Promise<void> {
    const view = this.windowView
    if (!view) return
    this.setWindowBright(options.bright ?? false)
    const key = options.video ?? src
    if (key === this.windowSrc) return
    this.windowSrc = key

    const texture =
      (options.video ? await this.loadWindowVideo(options.video) : null) ?? (await this.loadWindowImage(src))
    if (this.windowSrc !== key || !texture) return
    const media = (texture.image ?? {}) as {
      width?: number
      height?: number
      videoWidth?: number
      videoHeight?: number
    }
    const width = media.videoWidth ?? media.width ?? 16
    const height = media.videoHeight ?? media.height ?? 9
    view.scale.set(WINDOW_VIEW_HEIGHT * (width / height), WINDOW_VIEW_HEIGHT, 1)
    if (this.windowVideo && view.material.map !== texture) {
      this.windowVideo.pause()
      this.windowVideo = null
    }
    if (texture instanceof THREE.VideoTexture) {
      this.windowVideo = texture.image as HTMLVideoElement
      void this.windowVideo.play().catch(() => undefined)
    }
    view.material.map = texture
    view.material.needsUpdate = true
  }

  setWindowBright(bright: boolean): void {
    const value = bright ? 1 : PASSIVE_DIM
    this.windowView?.material.color.setRGB(value, value, value)
  }

  /** Starts loading images early so the switch is instant. */
  preloadWindow(srcs: string[]): void {
    for (const src of srcs) void this.loadWindowImage(src)
  }

  private loadWindowImage(src: string): Promise<THREE.Texture | null> {
    let pending = this.windowTextures.get(src)
    if (!pending) {
      pending = new Promise((resolve) => {
        new THREE.TextureLoader().load(
          mediaSrc(src),
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            resolve(texture)
          },
          undefined,
          () => {
            console.warn(`[window] Missing image "${src}".`)
            resolve(null)
          },
        )
      })
      this.windowTextures.set(src, pending)
    }
    return pending
  }

  private loadWindowVideo(src: string): Promise<THREE.VideoTexture | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' })
      video.setAttribute('playsinline', '')
      let settled = false
      const done = (texture: THREE.VideoTexture | null): void => {
        if (settled) return
        settled = true
        if (!texture) {
          console.warn(`[window] Video "${src}" not available; using the image.`)
          video.removeAttribute('src')
        }
        resolve(texture)
      }
      video.addEventListener(
        'loadeddata',
        () => {
          const texture = new THREE.VideoTexture(video)
          texture.colorSpace = THREE.SRGBColorSpace
          done(texture)
        },
        { once: true },
      )
      video.addEventListener('error', () => done(null), { once: true })
      window.setTimeout(() => done(null), 3000)
      video.src = mediaSrc(src)
      video.load()
    })
  }

  // ---------- TV: screen on the real model, shown only while the player is at the TV

  /**
   * Builds the (hidden) screen plane, the viewpoint in front of it and the back
   * button. `viewer` is in model coordinates: the side of the TV facing it is the front.
   */
  setupTv(tv: THREE.Object3D | null, viewer: THREE.Vector3): void {
    if (!tv || this.tvScreen) return
    const box = bounds(tv, this.room)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const toViewer = viewer.clone().sub(center)
    const alongX = Math.abs(toViewer.x) > Math.abs(toViewer.z)
    const normal = alongX
      ? new THREE.Vector3(Math.sign(toViewer.x), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(toViewer.z))
    const bodyWidth = alongX ? size.z : size.x
    const depth = alongX ? size.x : size.z
    // The bounds include the antennas, so estimate the cabinet height from its width.
    const bodyHeight = Math.min(size.y, bodyWidth * 0.62)

    const screenWidth = bodyWidth * 0.94
    const screenHeight = bodyHeight * 0.94
    const screenCenter = new THREE.Vector3(center.x, box.min.y + bodyHeight / 2, center.z)
      .addScaledVector(normal, depth / 2 + 0.006)

    this.staticCanvas = document.createElement('canvas')
    this.staticCanvas.width = 96
    this.staticCanvas.height = 72
    this.staticTexture = new THREE.CanvasTexture(this.staticCanvas)
    this.staticTexture.magFilter = THREE.NearestFilter
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      new THREE.MeshBasicMaterial({ map: this.staticTexture, toneMapped: false, fog: false }),
    )
    screen.name = 'ecran_tv'
    screen.position.copy(screenCenter)
    screen.quaternion.setFromUnitVectors(FACING, normal)
    screen.raycast = () => undefined
    screen.visible = false
    this.room.add(screen)
    this.tvScreen = screen

    // Viewpoint: seated eye height, a little under a metre in front of the screen.
    this.tvViewpoint = screenCenter.clone().addScaledVector(normal, TV_VIEW_DISTANCE)
    this.tvViewpoint.y = screenCenter.y + TV_VIEW_EYE_ABOVE

    const button = new THREE.Mesh(
      new THREE.PlaneGeometry(TV_BUTTON_W, (TV_BUTTON_W * BUTTON_CANVAS_H) / BUTTON_CANVAS_W),
      new THREE.MeshBasicMaterial({
        map: this.buttonFace.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    )
    button.name = 'tv_inapoi'
    button.renderOrder = 8
    button.position
      .copy(screenCenter)
      .addScaledVector(normal, 0.18)
      .setY(box.min.y + 0.02 + (TV_BUTTON_W * BUTTON_CANVAS_H) / BUTTON_CANVAS_W / 2)
    button.quaternion.setFromUnitVectors(FACING, normal)
    button.visible = false
    this.room.add(button)
    this.tvButton = button
  }

  /** Where the player stands to watch the TV (model coordinates), or null without a TV. */
  getTvViewpoint(): THREE.Vector3 | null {
    return this.tvViewpoint
  }

  /** Shows static (or `video`, if it loads) on the TV screen and the back button. */
  showTv(on: boolean, backLabel = '', video?: string): void {
    if (!this.tvScreen || !this.tvButton) return
    this.tvScreen.visible = on
    this.tvButton.visible = on
    if (on) {
      this.tvLabel = backLabel
      this.tvProgress = -1
      this.setTvProgress(0)
      this.tvScreen.material.map = this.staticTexture
      this.tvScreen.material.needsUpdate = true
      if (video) this.loadTvVideo(video)
    } else if (this.tvVideo) {
      this.tvVideo.pause()
      this.tvVideo.removeAttribute('src')
      this.tvVideo.load()
      this.tvVideo = null
    }
  }

  isTvButtonLookedAt(camera: THREE.Camera): boolean {
    if (!this.tvButton?.visible) return false
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    return this.raycaster.intersectObject(this.tvButton, false).length > 0
  }

  /** Fill of the back button while the player gazes at it (0..1). */
  setTvProgress(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1)
    if (Math.abs(clamped - this.tvProgress) < 0.01) return
    this.tvProgress = clamped
    const { ctx, texture } = this.buttonFace
    ctx.clearRect(0, 0, BUTTON_CANVAS_W, BUTTON_CANVAS_H)
    ctx.beginPath()
    ctx.roundRect(6, 6, BUTTON_CANVAS_W - 12, BUTTON_CANVAS_H - 12, 36)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.9)'
    ctx.fill()
    if (clamped > 0) {
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(244, 197, 131, 0.35)'
      ctx.fillRect(6, 6, (BUTTON_CANVAS_W - 12) * clamped, BUTTON_CANVAS_H - 12)
      ctx.restore()
    }
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.85)'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#f3eee4'
    ctx.font = '600 64px system-ui, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.tvLabel, BUTTON_CANVAS_W / 2, BUTTON_CANVAS_H / 2 + 2)
    texture.needsUpdate = true
  }

  private loadTvVideo(src: string): void {
    const video = document.createElement('video')
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' })
    video.setAttribute('playsinline', '')
    video.addEventListener(
      'loadeddata',
      () => {
        if (this.tvVideo !== video || !this.tvScreen) return
        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace
        this.tvScreen.material.map = texture
        this.tvScreen.material.needsUpdate = true
        void video.play().catch(() => undefined)
      },
      { once: true },
    )
    video.addEventListener('error', () => console.warn(`[tv] Missing video "${src}"; showing static.`), {
      once: true,
    })
    video.src = mediaSrc(src)
    video.load()
    this.tvVideo = video
  }

  /** Redraws the static while the TV screen is visible. */
  update(delta: number): void {
    if (!this.staticCanvas || !this.staticTexture || !this.tvScreen?.visible) return
    if (this.tvScreen.material.map !== this.staticTexture) return
    this.staticClock += delta
    if (this.staticClock < 1 / STATIC_FPS) return
    this.staticClock = 0
    const ctx = this.staticCanvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(this.staticCanvas.width, this.staticCanvas.height)
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 30 + Math.random() * 170
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v * 1.05
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    this.staticTexture.needsUpdate = true
  }

  /** Back to the start of a day: power on, no glow, passive window, TV screen off. */
  reset(): void {
    for (const object of this.glow.keys()) this.setGlow(object, 0)
    this.setPower(true)
    this.setWindowBright(false)
    this.windowVideo?.pause()
    this.showTv(false)
  }
}
