import * as THREE from 'three'

const WALK_SPEED = 1.15

export class DesktopControls {
  yaw = 0
  pitch = 0

  private readonly camera: THREE.PerspectiveCamera
  private readonly element: HTMLElement
  private eyeHeight: number
  private readonly onExit: () => void
  private readonly keys = new Set<string>()
  private enabled = false
  private dragging = false
  private pointerX = 0
  private pointerY = 0

  constructor(
    element: HTMLElement,
    camera: THREE.PerspectiveCamera,
    eyeHeight: number,
    onExit: () => void,
  ) {
    this.element = element
    this.camera = camera
    this.eyeHeight = eyeHeight
    this.onExit = onExit

    element.addEventListener('pointerdown', this.handlePointerDown)
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerUp)
    window.addEventListener('blur', this.handleBlur)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
  }

  setEyeHeight(height: number): void {
    this.eyeHeight = height
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.dragging = false
    this.keys.clear()
    if (!enabled) {
      this.element.style.cursor = ''
    }
  }

  update(delta: number): void {
    if (!this.enabled) return

    let forward = 0
    let strafe = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1

    if (forward !== 0 || strafe !== 0) {
      const length = Math.hypot(forward, strafe)
      const step = WALK_SPEED * delta
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      this.camera.position.x += ((-sin * forward + cos * strafe) / length) * step
      this.camera.position.z += ((-cos * forward - sin * strafe) / length) * step
    }

    this.camera.position.y = this.eyeHeight
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    window.removeEventListener('blur', this.handleBlur)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return
    this.dragging = true
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.element.style.cursor = 'grabbing'
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.dragging) return
    if (event.buttons === 0) {
      this.handlePointerUp()
      return
    }
    const deltaX = event.clientX - this.pointerX
    const deltaY = event.clientY - this.pointerY
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.yaw -= deltaX * 0.0034
    this.pitch = THREE.MathUtils.clamp(this.pitch - deltaY * 0.003, -1.05, 0.85)
  }

  private readonly handlePointerUp = (): void => {
    if (!this.dragging) return
    this.dragging = false
    this.element.style.cursor = ''
  }

  private readonly handleBlur = (): void => {
    this.dragging = false
    this.keys.clear()
    this.element.style.cursor = ''
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return
    if (event.code === 'Escape') {
      this.onExit()
      return
    }
    if (event.code.startsWith('Arrow')) event.preventDefault()
    this.keys.add(event.code)
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }
}
