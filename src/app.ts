import * as THREE from 'three'
import { OrientationControls } from './cardboard/orientation'
import { StereoEffect } from './cardboard/stereo'
import { DesktopControls } from './input/desktop'
import type { Mode } from './mode'
import { createHintPanel } from './scene/hint'
import { createPrologueScreen } from './scene/prologue'
import type { PrologueScreen } from './scene/prologue'
import { createRoom } from './scene/room'
import type { Room } from './scene/room'
import { enterVRSession } from './xr/session'

const EYE_HEIGHT = 1.62
const EYE_START = new THREE.Vector3(0.2, EYE_HEIGHT, 1.85)
const LOBBY_YAW = -0.12
const HINT_DURATION = 5500
const HINT_FADE = 800
const CARDBOARD_HUD_DISTANCE = 10
const WEBXR_HUD_DISTANCE = 50
const RETICLE_REFERENCE = 1.1
const HINT_REFERENCE = 1.2

function createReticle(): THREE.Group {
  const group = new THREE.Group()
  group.visible = false

  const material = new THREE.MeshBasicMaterial({
    color: 0xf4c583,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    depthWrite: false,
    fog: false,
  })

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.013, 0.0165, 40), material)
  ring.renderOrder = 10
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 16), material)
  dot.renderOrder = 10

  group.add(ring, dot)
  return group
}

function requestOrientationPermission(): Promise<void> {
  const constructor = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>
  }
  if (typeof constructor?.requestPermission !== 'function') return Promise.resolve()
  return constructor
    .requestPermission()
    .then(() => undefined)
    .catch(() => undefined)
}

export class App {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly rig = new THREE.Group()
  private readonly world = new THREE.Group()
  private readonly room: Room
  private readonly reticle = createReticle()
  private readonly hint = createHintPanel()
  private readonly prologue: PrologueScreen
  private readonly controls: DesktopControls
  private readonly stereo: StereoEffect
  private readonly orientation: OrientationControls
  private readonly timer = new THREE.Timer()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly onModeChange: (mode: Mode) => void
  private mode: Mode = 'lobby'
  private entering = false
  private hintUntil = 0

  constructor(canvas: HTMLCanvasElement, onModeChange: (mode: Mode) => void) {
    this.onModeChange = onModeChange

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.xr.enabled = true
    this.renderer.xr.setReferenceSpaceType('local')

    this.scene.background = new THREE.Color(0x07080a)
    this.scene.fog = new THREE.FogExp2(0x07080a, 0.048)

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60)
    this.camera.position.copy(EYE_START)
    this.camera.rotation.x = -0.02
    this.rig.add(this.camera)
    this.scene.add(this.rig)

    this.room = createRoom()
    this.world.add(this.room.root)
    this.scene.add(this.world)

    this.camera.add(this.reticle)
    this.camera.add(this.hint.object)

    this.prologue = createPrologueScreen(this.camera, () => this.handlePrologueEnd())
    this.camera.add(this.prologue.object)

    this.controls = new DesktopControls(canvas, this.camera, this.rig, () =>
      this.exitToLobby(),
    )
    this.stereo = new StereoEffect(this.renderer)
    this.orientation = new OrientationControls(this.camera)
    this.setHudDistance(CARDBOARD_HUD_DISTANCE)

    this.updateViewport()
    this.timer.connect(document)
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('orientationchange', this.handleResize)
    window.visualViewport?.addEventListener('resize', this.handleResize)
    window.addEventListener('keydown', this.handleKeyDown)
    document.addEventListener('fullscreenchange', this.handleFullscreenChange)
    this.renderer.setAnimationLoop(this.frame)
  }

  enterDesktop(): void {
    if (this.mode !== 'lobby' || this.entering) return
    void this.requestFullscreen()
    this.controls.yaw = this.rig.rotation.y
    this.controls.pitch = this.camera.rotation.x
    this.controls.setEnabled(true)
    this.setMode('desktop')
  }

  exitToLobby(): void {
    if (this.mode !== 'desktop') return
    this.controls.setEnabled(false)
    this.exitFullscreen()
    this.setMode('lobby')
    this.updateViewport()
  }

  async enterVR(): Promise<void> {
    if (this.mode !== 'lobby' || this.entering) return
    this.entering = true
    this.controls.setEnabled(false)
    this.orientation.setEnabled(false)
    try {
      const session = await enterVRSession(this.renderer)

      this.world.position.y = -EYE_HEIGHT
      this.rig.rotation.set(0, 0, 0)
      this.rig.position.set(0, 0, 0)
      this.camera.rotation.set(0, 0, 0)
      this.camera.position.set(0, 0, 0)
      this.setHudDistance(WEBXR_HUD_DISTANCE)
      this.reticle.visible = false
      this.hint.object.visible = false
      this.prologue.start()
      this.setMode('vr')

      session.addEventListener('end', this.handleSessionEnd, { once: true })
    } finally {
      this.entering = false
    }
  }

  async enterCardboard(): Promise<void> {
    if (this.mode !== 'lobby' || this.entering) return
    this.entering = true
    this.controls.setEnabled(false)
    this.rig.rotation.set(0, 0, 0)
    this.rig.position.set(0, 0, 0)
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(0, 0, 0)
    this.world.position.y = 0
    this.setHudDistance(CARDBOARD_HUD_DISTANCE)
    this.reticle.visible = false
    this.hint.object.visible = false
    this.prologue.start()
    this.setMode('cardboard')
    this.updateViewport()

    const permission = requestOrientationPermission()
    const fullscreen = this.requestFullscreen()
    this.orientation.setEnabled(true)

    try {
      await fullscreen
      if (!this.isCardboard()) {
        this.exitFullscreen()
        return
      }
      await permission
      if (this.isCardboard()) await this.lockLandscape()
    } finally {
      this.entering = false
    }
  }

  exitCardboard(): void {
    if (this.mode !== 'cardboard') return
    this.prologue.stop()
    this.orientation.setEnabled(false)
    this.reticle.visible = false
    this.hint.object.visible = false
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(this.basePitch(), 0, 0)
    this.rig.rotation.set(0, 0, 0)
    this.setMode('lobby')
    this.exitFullscreen()
    this.unlockOrientation()
    this.updateViewport()
  }

  private readonly handleSessionEnd = (): void => {
    this.prologue.stop()
    this.world.position.y = 0
    this.reticle.visible = false
    this.hint.object.visible = false
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(this.basePitch(), 0, 0)
    this.rig.rotation.set(0, 0, 0)
    this.setMode('lobby')
    this.updateViewport()
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('orientationchange', this.handleResize)
    window.visualViewport?.removeEventListener('resize', this.handleResize)
    window.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange)
    this.renderer.setAnimationLoop(null)
    this.timer.disconnect()
    this.orientation.dispose()
    this.controls.dispose()
    this.room.dispose()
    this.prologue.dispose()
    this.renderer.dispose()
  }

  private showHint(): void {
    this.hint.object.visible = true
    this.hint.material.opacity = 0.95
    this.hintUntil = performance.now() + HINT_DURATION
  }

  private readonly handlePrologueEnd = (): void => {
    if (this.mode !== 'vr' && this.mode !== 'cardboard') return
    this.reticle.visible = true
    this.showHint()
  }

  private setHudDistance(distance: number): void {
    this.reticle.position.set(0, 0, -distance)
    this.reticle.scale.setScalar(distance / RETICLE_REFERENCE)
    this.hint.object.position.set(0, -0.3 * (distance / HINT_REFERENCE), -distance)
    this.hint.object.scale.setScalar(distance / HINT_REFERENCE)
  }

  private requestFullscreen(): Promise<void> {
    const element = document.documentElement
    if (!element.requestFullscreen) return Promise.resolve()
    return element
      .requestFullscreen({ navigationUI: 'hide' })
      .catch(() => undefined)
  }

  private exitFullscreen(): void {
    if (!document.fullscreenElement) return
    void document.exitFullscreen().catch(() => undefined)
  }

  private async lockLandscape(): Promise<void> {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (value: string) => Promise<void>
    }
    if (!orientation?.lock) return
    try {
      await orientation.lock('landscape')
    } catch {
      return
    }
  }

  private unlockOrientation(): void {
    const orientation = screen.orientation as ScreenOrientation & {
      unlock?: () => void
    }
    if (!orientation?.unlock) return
    try {
      orientation.unlock()
    } catch {
      return
    }
  }

  private isCardboard(): boolean {
    return this.mode === 'cardboard'
  }

  private basePitch(): number {
    return this.camera.aspect < 0.8 ? -0.09 : -0.02
  }

  private setMode(mode: Mode): void {
    this.mode = mode
    this.onModeChange(mode)
  }

  private updateViewport(): void {
    if (this.renderer.xr.isPresenting) return
    const width = window.innerWidth
    const height = window.innerHeight
    const aspect = width / height
    this.camera.aspect = aspect
    this.camera.fov = this.mode === 'cardboard' ? 68 : aspect < 0.8 ? 74 : 62
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private readonly handleResize = (): void => {
    this.updateViewport()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.mode === 'cardboard') {
      this.exitCardboard()
    }
  }

  private readonly handleFullscreenChange = (): void => {
    if (!document.fullscreenElement && this.mode === 'cardboard') {
      this.exitCardboard()
    }
  }

  private readonly frame = (): void => {
    this.timer.update()
    const delta = Math.min(this.timer.getDelta(), 0.05)
    const time = this.timer.getElapsed()

    if (this.hint.object.visible) {
      const remaining = this.hintUntil - performance.now()
      if (remaining <= 0) {
        this.hint.object.visible = false
      } else {
        this.hint.material.opacity = Math.min(0.95, remaining / HINT_FADE)
      }
    }

    if (this.mode === 'lobby') {
      if (this.reducedMotion.matches) {
        this.rig.rotation.y = LOBBY_YAW
        this.camera.rotation.x = this.basePitch()
      } else {
        this.rig.rotation.y = LOBBY_YAW + Math.sin(time * 0.13) * 0.045
        this.camera.rotation.x = this.basePitch() + Math.sin(time * 0.08) * 0.012
      }
      this.camera.position.copy(EYE_START)
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.mode === 'desktop') {
      this.controls.update(delta)
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.mode === 'vr') {
      this.prologue.update(delta)
      this.renderer.render(this.scene, this.camera)
      return
    }

    this.prologue.update(delta)
    this.orientation.update()
    this.stereo.render(this.scene, this.camera)
  }
}
