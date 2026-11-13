import * as THREE from 'three'
import { DesktopControls } from './input/desktop'
import type { Mode } from './mode'
import { createHintPanel } from './scene/hint'
import { createRoom } from './scene/room'
import type { Room } from './scene/room'
import { enterVRSession } from './xr/session'

const EYE_HEIGHT = 1.62
const EYE_START = new THREE.Vector3(0.2, EYE_HEIGHT, 1.85)
const LOBBY_YAW = -0.12
const HINT_DURATION = 5500
const HINT_FADE = 800

function createReticle(): THREE.Group {
  const group = new THREE.Group()
  group.position.set(0, 0, -1.1)
  group.visible = false

  const material = new THREE.MeshBasicMaterial({
    color: 0xf4c583,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    depthWrite: false,
  })

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.013, 0.0165, 40), material)
  ring.renderOrder = 10
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 16), material)
  dot.renderOrder = 10

  group.add(ring, dot)
  return group
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
  private readonly controls: DesktopControls
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

    this.controls = new DesktopControls(canvas, this.camera, this.rig, () =>
      this.exitToLobby(),
    )

    this.updateViewport()
    this.timer.connect(document)
    window.addEventListener('resize', this.handleResize)
    this.renderer.setAnimationLoop(this.frame)
  }

  enterDesktop(): void {
    if (this.mode === 'vr' || this.entering) return
    this.controls.yaw = this.rig.rotation.y
    this.controls.pitch = this.camera.rotation.x
    this.controls.setEnabled(true)
    this.setMode('desktop')
  }

  exitToLobby(): void {
    if (this.mode === 'vr' || this.entering) return
    this.controls.setEnabled(false)
    this.setMode('lobby')
  }

  async enterVR(): Promise<void> {
    if (this.mode === 'vr' || this.entering) return
    this.entering = true
    this.controls.setEnabled(false)
    try {
      const session = await enterVRSession(this.renderer)

      this.world.position.y = -EYE_HEIGHT
      this.rig.rotation.set(0, 0, 0)
      this.rig.position.set(0, 0, 0)
      this.camera.rotation.set(0, 0, 0)
      this.camera.position.set(0, 0, 0)
      this.reticle.visible = true
      this.showHint()
      this.setMode('vr')

      session.addEventListener('end', this.handleSessionEnd, { once: true })
    } finally {
      this.entering = false
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize)
    this.renderer.setAnimationLoop(null)
    this.timer.disconnect()
    this.controls.dispose()
    this.room.dispose()
    this.renderer.dispose()
  }

  private showHint(): void {
    this.hint.object.visible = true
    this.hint.material.opacity = 0.95
    this.hintUntil = performance.now() + HINT_DURATION
  }

  private basePitch(): number {
    return this.camera.aspect < 0.8 ? -0.09 : -0.02
  }

  private setMode(mode: Mode): void {
    this.mode = mode
    this.onModeChange(mode)
  }

  private readonly handleSessionEnd = (): void => {
    this.world.position.y = 0
    this.reticle.visible = false
    this.hint.object.visible = false
    this.camera.position.copy(EYE_START)
    this.camera.rotation.set(this.basePitch(), 0, 0)
    this.rig.rotation.set(0, 0, 0)
    this.setMode('lobby')
  }

  private updateViewport(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    const aspect = width / height
    this.camera.aspect = aspect
    this.camera.fov = aspect < 0.8 ? 74 : 62
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private readonly handleResize = (): void => {
    this.updateViewport()
  }

  private readonly frame = (): void => {
    this.timer.update()
    const delta = Math.min(this.timer.getDelta(), 0.05)
    const time = this.timer.getElapsed()

    if (this.mode === 'lobby') {
      if (this.reducedMotion.matches) {
        this.rig.rotation.y = LOBBY_YAW
        this.camera.rotation.x = this.basePitch()
      } else {
        this.rig.rotation.y = LOBBY_YAW + Math.sin(time * 0.13) * 0.045
        this.camera.rotation.x = this.basePitch() + Math.sin(time * 0.08) * 0.012
      }
      this.camera.position.copy(EYE_START)
    } else if (this.mode === 'desktop') {
      this.controls.update(delta)
    } else if (this.hint.object.visible) {
      const remaining = this.hintUntil - performance.now()
      if (remaining <= 0) {
        this.hint.object.visible = false
      } else {
        this.hint.material.opacity = Math.min(0.95, remaining / HINT_FADE)
      }
    }

    this.renderer.render(this.scene, this.camera)
  }
}
