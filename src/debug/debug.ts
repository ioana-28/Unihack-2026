import * as THREE from 'three'
import './debug.css'

const MOVE_SPEED = 2.4
const FAST_MULTIPLIER = 3
const VERTICAL_SPEED = 1.6
const LOOK_SENSITIVITY = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.05
const RAYCAST_INTERVAL = 0.1

type DebugPose = {
  position: THREE.Vector3
  yaw: number
  pitch: number
}

type DebugOptions = {
  canvas: HTMLCanvasElement
  camera: THREE.PerspectiveCamera
  rig: THREE.Object3D
  room: THREE.Object3D
}

function requireChild(parent: HTMLElement, selector: string): HTMLElement {
  const element = parent.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Element not found: ${selector}`)
  return element
}

function isVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

export class DebugControls {
  private readonly canvas: HTMLCanvasElement
  private readonly camera: THREE.PerspectiveCamera
  private readonly rig: THREE.Object3D
  private readonly room: THREE.Object3D
  private readonly raycaster = new THREE.Raycaster()
  private readonly center = new THREE.Vector2(0, 0)
  private readonly position = new THREE.Vector3()
  private readonly keys = new Set<string>()
  private readonly hud: HTMLElement
  private readonly crosshair: HTMLElement
  private readonly posField: HTMLElement
  private readonly rotField: HTMLElement
  private readonly modeField: HTMLElement
  private readonly targetField: HTMLElement
  private readonly pointField: HTMLElement
  private readonly waypointField: HTMLElement
  private readonly flashField: HTMLElement
  private readonly waypoints: string[] = []
  private active = false
  private yaw = 0
  private pitch = 0
  private dragging = false
  private pointerLocked = false
  private pointerX = 0
  private pointerY = 0
  private rayTimer = 0
  private flashTimer = 0
  private targetName = ''
  private hitPoint: THREE.Vector3 | null = null

  constructor(options: DebugOptions) {
    this.canvas = options.canvas
    this.camera = options.camera
    this.rig = options.rig
    this.room = options.room

    this.hud = document.createElement('div')
    this.hud.className = 'debug-hud'
    this.hud.hidden = true
    this.hud.setAttribute('aria-hidden', 'true')
    this.hud.innerHTML = `
      <div class="debug-hud__bar">
        <span class="debug-hud__title">DEBUG</span>
        <span class="debug-hud__key">Ctrl+Shift+\`</span>
      </div>
      <div class="debug-hud__row"><span>pos</span><b data-debug="pos">—</b></div>
      <div class="debug-hud__row"><span>rot</span><b data-debug="rot">—</b></div>
      <div class="debug-hud__row"><span>mode</span><b data-debug="mode">—</b></div>
      <div class="debug-hud__row"><span>target</span><b data-debug="target">—</b></div>
      <div class="debug-hud__row"><span>point</span><b data-debug="point">—</b></div>
      <p class="debug-hud__help">WASD move · Q/E down/up · Shift fast · Click to look · Esc release mouse · C copy pose · P waypoint · L copy waypoints · Del clear</p>
      <div class="debug-hud__waypoints" data-debug="waypoints" hidden></div>
      <p class="debug-hud__flash" data-debug="flash" hidden></p>
    `
    document.body.append(this.hud)

    this.crosshair = document.createElement('div')
    this.crosshair.className = 'debug-crosshair'
    this.crosshair.hidden = true
    document.body.append(this.crosshair)

    this.posField = requireChild(this.hud, '[data-debug="pos"]')
    this.rotField = requireChild(this.hud, '[data-debug="rot"]')
    this.modeField = requireChild(this.hud, '[data-debug="mode"]')
    this.targetField = requireChild(this.hud, '[data-debug="target"]')
    this.pointField = requireChild(this.hud, '[data-debug="point"]')
    this.waypointField = requireChild(this.hud, '[data-debug="waypoints"]')
    this.flashField = requireChild(this.hud, '[data-debug="flash"]')

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerUp)
    document.addEventListener('pointerlockchange', this.handlePointerLockChange)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleBlur)
  }

  isActive(): boolean {
    return this.active
  }

  activate(): void {
    if (this.active) return
    this.camera.updateMatrixWorld(true)
    this.camera.getWorldPosition(this.position)

    const worldQuaternion = new THREE.Quaternion()
    this.camera.getWorldQuaternion(worldQuaternion)
    const euler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'YXZ')
    this.yaw = euler.y
    this.pitch = euler.x

    this.rig.position.set(0, 0, 0)
    this.rig.rotation.set(0, 0, 0)
    this.camera.position.copy(this.position)
    this.applyPose()

    this.active = true
    this.rayTimer = 0
    this.hud.hidden = false
    this.crosshair.hidden = false
    document.body.classList.add('debug-mode')
    this.canvas.style.cursor = 'crosshair'
    this.updateHud()
  }

  deactivate(): void {
    if (!this.active) return
    this.active = false
    this.keys.clear()
    this.dragging = false
    this.pointerLocked = false
    this.hud.hidden = true
    this.crosshair.hidden = true
    document.body.classList.remove('debug-mode')
    this.canvas.style.cursor = ''
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  getPose(): DebugPose {
    return {
      position: this.position.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
    }
  }

  update(delta: number): void {
    if (!this.active) return
    this.move(delta)
    this.applyPose()
    this.camera.updateMatrixWorld(true)
    this.updateRaycast(delta)
    this.updateHud()
  }

  dispose(): void {
    this.deactivate()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleBlur)
    window.clearTimeout(this.flashTimer)
    this.hud.remove()
    this.crosshair.remove()
  }

  private applyPose(): void {
    this.camera.position.copy(this.position)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  private move(delta: number): void {
    let forward = 0
    let strafe = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1

    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const speed = MOVE_SPEED * (fast ? FAST_MULTIPLIER : 1)

    if (forward !== 0 || strafe !== 0) {
      const length = Math.hypot(forward, strafe)
      const step = speed * delta
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      this.position.x += ((-sin * forward + cos * strafe) / length) * step
      this.position.z += ((-cos * forward - sin * strafe) / length) * step
    }

    let vertical = 0
    if (this.keys.has('KeyE') || this.keys.has('PageUp')) vertical += 1
    if (this.keys.has('KeyQ') || this.keys.has('PageDown')) vertical -= 1
    if (vertical !== 0) {
      this.position.y += vertical * VERTICAL_SPEED * (fast ? FAST_MULTIPLIER : 1) * delta
    }
  }

  private look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * LOOK_SENSITIVITY
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - deltaY * LOOK_SENSITIVITY,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    )
  }

  private updateRaycast(delta: number): void {
    this.rayTimer += delta
    if (this.rayTimer < RAYCAST_INTERVAL) return
    this.rayTimer = 0

    this.raycaster.setFromCamera(this.center, this.camera)
    const hits = this.raycaster.intersectObject(this.room, true)
    const hit = hits.find((entry) => isVisible(entry.object))
    if (!hit) {
      this.targetName = ''
      this.hitPoint = null
      return
    }

    let object: THREE.Object3D | null = hit.object
    while (object && object !== this.room) {
      if (object.name) break
      object = object.parent
    }
    this.targetName = object?.name ?? 'object'
    this.hitPoint = hit.point.clone()
  }

  private updateHud(): void {
    const x = this.position.x.toFixed(2)
    const y = this.position.y.toFixed(2)
    const z = this.position.z.toFixed(2)
    const yaw = THREE.MathUtils.radToDeg(this.yaw).toFixed(1)
    const pitch = THREE.MathUtils.radToDeg(this.pitch).toFixed(1)

    this.posField.textContent = `${x}, ${y}, ${z}`
    this.rotField.textContent = `${yaw}°, ${pitch}°`
    this.modeField.textContent = document.body.dataset.mode ?? '—'
    this.targetField.textContent = this.targetName || '—'
    this.pointField.textContent = this.hitPoint
      ? `${this.hitPoint.x.toFixed(2)}, ${this.hitPoint.y.toFixed(2)}, ${this.hitPoint.z.toFixed(2)}`
      : '—'
  }

  private poseText(): string {
    const target = this.targetName ? `, "target": "${this.targetName}"` : ''
    return `{ "x": ${this.position.x.toFixed(3)}, "y": ${this.position.y.toFixed(3)}, "z": ${this.position.z.toFixed(3)}, "yaw": ${this.yaw.toFixed(3)}, "pitch": ${this.pitch.toFixed(3)}${target} }`
  }

  private addWaypoint(): void {
    this.waypoints.push(this.poseText())
    if (this.waypoints.length > 24) this.waypoints.shift()
  }

  private renderWaypoints(): void {
    if (this.waypoints.length === 0) {
      this.waypointField.hidden = true
      this.waypointField.textContent = ''
      return
    }
    this.waypointField.hidden = false
    this.waypointField.textContent = this.waypoints
      .map((waypoint, index) => `${index + 1}. ${waypoint}`)
      .join('\n')
  }

  private clearWaypoints(): void {
    this.waypoints.length = 0
    this.renderWaypoints()
    this.flash('Waypoints șterse')
  }

  private copyPose(): void {
    this.copy(this.poseText(), 'Poză copiată')
  }

  private copyWaypoints(): void {
    if (this.waypoints.length === 0) {
      this.flash('Niciun waypoint')
      return
    }
    this.copy(this.waypoints.join('\n'), 'Waypoints copiate')
  }

  private copy(text: string, message: string): void {
    const done = (): void => this.flash(message)
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, message))
      return
    }
    this.fallbackCopy(text, message)
  }

  private fallbackCopy(text: string, message: string): void {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    try {
      document.execCommand('copy')
      this.flash(message)
    } catch {
      this.flash('Copiere eșuată')
    }
    area.remove()
  }

  private flash(message: string): void {
    this.flashField.hidden = false
    this.flashField.textContent = message
    window.clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => {
      this.flashField.hidden = true
    }, 1400)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.dragging = true
    const result = this.canvas.requestPointerLock() as unknown
    if (result instanceof Promise) void result.catch(() => undefined)
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.active) return
    if (this.pointerLocked) {
      this.look(event.movementX, event.movementY)
      return
    }
    if (!this.dragging) return
    if (event.buttons === 0) {
      this.dragging = false
      return
    }
    const deltaX = event.clientX - this.pointerX
    const deltaY = event.clientY - this.pointerY
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.look(deltaX, deltaY)
  }

  private readonly handlePointerUp = (): void => {
    this.dragging = false
  }

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas
    if (this.pointerLocked) this.dragging = false
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) return

    if (event.code === 'KeyC') {
      event.preventDefault()
      if (!event.repeat) this.copyPose()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (!event.repeat) {
        this.addWaypoint()
        this.renderWaypoints()
        this.flash(`Waypoint ${this.waypoints.length}`)
      }
      return
    }
    if (event.code === 'KeyL') {
      event.preventDefault()
      if (!event.repeat) this.copyWaypoints()
      return
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault()
      if (!event.repeat) this.clearWaypoints()
      return
    }

    if (event.code === 'Escape') return
    if (
      event.code.startsWith('Arrow') ||
      event.code === 'KeyW' ||
      event.code === 'KeyA' ||
      event.code === 'KeyS' ||
      event.code === 'KeyD' ||
      event.code === 'KeyQ' ||
      event.code === 'KeyE' ||
      event.code === 'PageUp' ||
      event.code === 'PageDown' ||
      event.code === 'ShiftLeft' ||
      event.code === 'ShiftRight'
    ) {
      event.preventDefault()
      this.keys.add(event.code)
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly handleBlur = (): void => {
    this.keys.clear()
    this.dragging = false
  }
}
