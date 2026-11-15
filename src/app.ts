import * as THREE from 'three'
import { OrientationControls } from './cardboard/orientation'
import { StereoEffect } from './cardboard/stereo'
import { DebugControls } from './debug/debug'
import { GameAudio } from './game/audio'
import { Overlay } from './game/overlay'
import { RoomFx } from './game/room-fx'
import { DayRunner } from './game/runner'
import { resetGame } from './game/state'
import './game/z17'
import './game/z20'
import { DesktopControls } from './input/desktop'
import type { Mode } from './mode'
import { createHintPanel } from './scene/hint'
import { createInteractionController } from './scene/interaction'
import type { InteractionController } from './scene/interaction'
import { createPrologueScreen } from './scene/prologue'
import type { PrologueScreen } from './scene/prologue'
import { createReticle } from './scene/reticle'
import { createRoom } from './scene/room'
import type { ModelProgress, Room } from './scene/room'
import { enterVRSession } from './xr/session'

const EYE_START = new THREE.Vector3(8.074, 1.032, -6.752)
const LOBBY_YAW = 3.1304
const LOBBY_PITCH = -0.117
const UP = new THREE.Vector3(0, 1, 0)
const HINT_DURATION = 5500
const HINT_FADE = 800
const CARDBOARD_HUD_DISTANCE = 10
const WEBXR_HUD_DISTANCE = 50
const RETICLE_REFERENCE = 1.1
const HINT_REFERENCE = 1.2

/** Demo jump: `?zi=17` starts that day with default variables; otherwise day 15. */
function startDay(): number {
  const zi = Number(new URLSearchParams(window.location.search).get('zi'))
  if (!Number.isInteger(zi) || zi < 15 || zi > 22) return 15
  resetGame()
  return zi
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
  private readonly debug: DebugControls
  private readonly interaction: InteractionController
  private readonly audio: GameAudio
  private readonly overlay: Overlay
  private readonly fx: RoomFx
  private readonly runner: DayRunner
  private readonly timer = new THREE.Timer()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly onModeChange: (mode: Mode) => void
  private mode: Mode = 'lobby'
  private entering = false
  private hintUntil = 0
  private mono = true
  private compiled = false
  private xrCompiled = false

  constructor(canvas: HTMLCanvasElement, onModeChange: (mode: Mode) => void) {
    this.onModeChange = onModeChange

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.xr.enabled = true
    this.renderer.xr.setReferenceSpaceType('local')
    this.renderer.xr.setFramebufferScaleFactor(0.75)
    this.renderer.xr.setFoveation(0.5)
    this.installMonoXR()

    this.scene.background = new THREE.Color(0x07080a)
    this.scene.fog = new THREE.FogExp2(0x07080a, 0.048)

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(LOBBY_PITCH, LOBBY_YAW, 0)
    this.rig.add(this.camera)
    this.scene.add(this.rig)

    this.room = createRoom(this.renderer)
    this.world.add(this.room.root)
    this.scene.add(this.world)

    this.camera.add(this.reticle.group)
    this.camera.add(this.hint.object)

    this.prologue = createPrologueScreen(
      this.camera,
      () => this.room.isReady(),
      () => this.handlePrologueEnd(),
    )
    this.camera.add(this.prologue.object)

    this.controls = new DesktopControls(canvas, this.camera, EYE_START.y, () =>
      this.exitToLobby(),
    )
    this.stereo = new StereoEffect(this.renderer)
    this.stereo.setMono(this.mono)
    this.orientation = new OrientationControls(this.camera)
    this.debug = new DebugControls({
      canvas,
      camera: this.camera,
      rig: this.rig,
      room: this.room.root,
    })
    this.interaction = createInteractionController({
      camera: this.camera,
      rig: this.rig,
      world: this.world,
      room: this.room.root,
      isRoomReady: () => this.room.isReady(),
      reticle: this.reticle,
      canvas,
      onDesktopArrive: (eyeHeight) => this.controls.setEyeHeight(eyeHeight),
      isObjectActive: (key) => this.runner.isActive(key),
      onActivate: (key) => this.runner.onActivate(key),
      isNavigationLocked: () => this.runner.isNavigationLocked(),
    })
    this.audio = new GameAudio(this.camera)
    this.overlay = new Overlay(this.scene, this.camera)
    this.fx = new RoomFx(this.room.root)
    this.runner = new DayRunner({
      audio: this.audio,
      overlay: this.overlay,
      fx: this.fx,
      camera: this.camera,
      room: this.room.root,
      isRoomReady: () => this.room.isReady(),
      currentPosition: () => this.interaction.currentStateId(),
      moveTo: (id) => this.interaction.moveTo(id),
      moveToPoint: (point) => this.interaction.moveToPoint(point),
      onFinished: () => this.returnToStart(),
    })
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
    if (this.debug.isActive()) return
    this.audio.resume()
    void this.requestFullscreen()
    this.controls.yaw = this.camera.rotation.y
    this.controls.pitch = this.camera.rotation.x
    this.controls.setEyeHeight(EYE_START.y)
    this.controls.setEnabled(true)
    this.reticle.group.visible = true
    this.interaction.reset()
    this.interaction.setMode('desktop')
    this.interaction.setEnabled(true)
    this.setMode('desktop')
    void this.runner.start(startDay())
  }

  /** Leaves the game (desktop or VR) and shows the start screen. */
  returnToStart(): void {
    if (this.mode === 'desktop') {
      this.exitToLobby()
      return
    }
    const session = this.renderer.xr.getSession()
    if (session) void session.end().catch(() => this.handleSessionEnd())
    else this.runner.stop()
  }

  exitToLobby(): void {
    if (this.mode !== 'desktop') return
    this.runner.stop()
    this.interaction.setEnabled(false)
    this.reticle.group.visible = false
    this.controls.setEnabled(false)
    this.exitFullscreen()
    this.setMode('lobby')
    this.updateViewport()
  }

  setDebug(enabled: boolean): void {
    if (enabled === this.debug.isActive()) return
    this.toggleDebug()
  }

  setMono(enabled: boolean): void {
    this.mono = enabled
    this.stereo.setMono(enabled)
  }

  getModelProgress(): ModelProgress {
    return this.room.getProgress()
  }

  isRoomReady(): boolean {
    return this.room.isReady()
  }

  getModelError(): unknown | null {
    return this.room.getError()
  }

  retryModel(): void {
    this.room.retry()
  }

  private toggleDebug(): void {
    if (this.debug.isActive()) {
      const pose = this.debug.getPose()
      this.debug.deactivate()
      if (this.mode === 'desktop') {
        this.camera.position.copy(pose.position)
        this.controls.yaw = pose.yaw
        this.controls.pitch = pose.pitch
        this.controls.setEnabled(true)
        this.interaction.setEnabled(true)
        this.reticle.group.visible = true
      }
      this.updateViewport()
      return
    }

    if (this.mode === 'vr' || this.mode === 'cardboard') return
    this.interaction.setEnabled(false)
    this.controls.setEnabled(false)
    this.orientation.setEnabled(false)
    this.reticle.group.visible = false
    this.hint.object.visible = false
    this.debug.activate()
  }

  async enterVR(): Promise<void> {
    if (this.mode !== 'lobby' || this.entering) return
    this.entering = true
    this.audio.resume()
    this.controls.setEnabled(false)
    this.orientation.setEnabled(false)
    try {
      const session = await enterVRSession(this.renderer)

      const spawnOffset = EYE_START.clone().applyAxisAngle(UP, -LOBBY_YAW)
      this.world.position.set(-spawnOffset.x, -EYE_START.y, -spawnOffset.z)
      this.world.rotation.y = -LOBBY_YAW
      this.rig.rotation.set(0, 0, 0)
      this.rig.position.set(0, 0, 0)
      this.camera.rotation.set(0, 0, 0)
      this.camera.position.set(0, 0, 0)
      this.setHudDistance(WEBXR_HUD_DISTANCE)
      this.reticle.group.visible = false
      this.hint.object.visible = false
      this.interaction.reset()
      this.interaction.setMode('vr')
      this.interaction.setEnabled(false)
      this.prologue.start()
      this.setMode('vr')

      if (!this.xrCompiled) {
        this.xrCompiled = true
        void this.renderer.compileAsync(this.scene, this.camera).catch((error: unknown) => {
          console.warn('Could not precompile XR shaders', error)
        })
      }

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
    this.camera.rotation.set(LOBBY_PITCH, LOBBY_YAW, 0)
    this.world.position.set(0, 0, 0)
    this.world.rotation.set(0, 0, 0)
    this.setHudDistance(CARDBOARD_HUD_DISTANCE)
    this.reticle.group.visible = false
    this.hint.object.visible = false
    this.prologue.start()
    this.setMode('cardboard')
    this.updateViewport()

    this.orientation.setSpawn(LOBBY_YAW, LOBBY_PITCH)
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
    this.interaction.setEnabled(false)
    this.prologue.stop()
    this.orientation.setEnabled(false)
    this.reticle.group.visible = false
    this.hint.object.visible = false
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(LOBBY_PITCH, LOBBY_YAW, 0)
    this.rig.rotation.set(0, 0, 0)
    this.world.position.set(0, 0, 0)
    this.world.rotation.set(0, 0, 0)
    this.setMode('lobby')
    this.exitFullscreen()
    this.unlockOrientation()
    this.updateViewport()
  }

  private readonly handleSessionEnd = (): void => {
    this.runner.stop()
    this.interaction.setEnabled(false)
    this.interaction.reset()
    this.prologue.stop()
    this.world.position.set(0, 0, 0)
    this.world.rotation.set(0, 0, 0)
    this.reticle.group.visible = false
    this.hint.object.visible = false
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(LOBBY_PITCH, LOBBY_YAW, 0)
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
    this.debug.dispose()
    this.runner.stop()
    this.overlay.dispose()
    this.interaction.dispose()
    this.reticle.dispose()
    this.room.dispose()
    this.prologue.dispose()
    this.renderer.dispose()
  }

  private showHint(): void {
    this.hint.object.visible = true
    this.hint.material.opacity = 0.95
    this.hintUntil = performance.now() + HINT_DURATION
  }

  private installMonoXR(): void {
    const xr = this.renderer.xr
    const original = xr.updateCamera.bind(xr)
    xr.updateCamera = (camera: THREE.PerspectiveCamera): void => {
      original(camera)
      if (!this.mono) return
      const xrCamera = xr.getCamera()
      for (const eye of xrCamera.cameras) {
        eye.matrixWorld.copy(camera.matrixWorld)
        eye.matrixWorldInverse.copy(camera.matrixWorldInverse)
        eye.projectionMatrix.copy(camera.projectionMatrix)
        eye.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
        eye.matrix.copy(camera.matrix)
        eye.position.copy(camera.position)
        eye.quaternion.copy(camera.quaternion)
        eye.scale.copy(camera.scale)
        eye.matrixWorldNeedsUpdate = true
      }
    }
  }

  private readonly handlePrologueEnd = (): void => {
    if (this.mode !== 'vr' && this.mode !== 'cardboard') return
    this.camera.focus = CARDBOARD_HUD_DISTANCE
    this.reticle.group.visible = true
    this.interaction.setMode(this.mode === 'vr' ? 'vr' : 'desktop')
    this.interaction.setEnabled(true)
    this.showHint()
    void this.runner.start(startDay())
  }

  private setHudDistance(distance: number): void {
    this.reticle.group.position.set(0, 0, -distance)
    this.reticle.group.scale.setScalar(distance / RETICLE_REFERENCE)
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
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Backquote') {
      event.preventDefault()
      this.toggleDebug()
      return
    }
    if (event.code === 'Escape' && this.mode === 'cardboard') {
      this.exitCardboard()
    }
  }

  private readonly handleFullscreenChange = (): void => {
    if (!document.fullscreenElement && this.mode === 'cardboard') {
      this.exitCardboard()
    }
  }

  private updateGame(delta: number, time: number): void {
    this.runner.update(time)
    this.fx.update(delta)
    this.overlay.update(delta)
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

    if (!this.compiled && this.room.isReady()) {
      this.compiled = true
      void this.renderer.compileAsync(this.scene, this.camera).catch((error: unknown) => {
        console.warn('Could not precompile room shaders', error)
      })
    }

    if (this.debug.isActive()) {
      this.debug.update(delta)
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.mode === 'lobby') {
      this.rig.position.set(0, 0, 0)
      this.rig.rotation.set(0, 0, 0)
      this.camera.position.copy(EYE_START)
      if (this.reducedMotion.matches) {
        this.camera.rotation.set(LOBBY_PITCH, LOBBY_YAW, 0)
      } else {
        this.camera.rotation.set(
          LOBBY_PITCH + Math.sin(time * 0.08) * 0.012,
          LOBBY_YAW + Math.sin(time * 0.13) * 0.045,
          0,
        )
      }
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.mode === 'desktop') {
      this.controls.update(delta)
      this.interaction.update(delta)
      this.updateGame(delta, time)
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.mode === 'vr') {
      this.prologue.update(delta)
      this.interaction.update(delta)
      this.updateGame(delta, time)
      this.renderer.render(this.scene, this.camera)
      return
    }

    this.prologue.update(delta)
    this.orientation.update()
    this.stereo.render(this.scene, this.camera)
  }
}
