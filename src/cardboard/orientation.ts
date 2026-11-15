import * as THREE from 'three'

const ZEE = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)

export class OrientationControls {
  private readonly camera: THREE.PerspectiveCamera
  private readonly euler = new THREE.Euler()
  private readonly target = new THREE.Quaternion()
  private readonly q0 = new THREE.Quaternion()
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  private readonly yawOffset = new THREE.Quaternion()
  private readonly forward = new THREE.Vector3()
  private enabled = false
  private recenter = true
  private spawnYaw = 0

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  setSpawn(yaw: number, pitch: number): void {
    this.spawnYaw = yaw
    this.recenter = true
    this.yawOffset.identity()
    this.target.setFromEuler(this.euler.set(pitch, yaw, 0, 'YXZ'))
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (enabled) {
      this.camera.quaternion.copy(this.target)
      window.addEventListener('deviceorientation', this.handleOrientation)
    } else {
      window.removeEventListener('deviceorientation', this.handleOrientation)
    }
  }

  update(): void {
    if (!this.enabled) return
    this.camera.quaternion.copy(this.target)
  }

  dispose(): void {
    this.setEnabled(false)
  }

  private readonly handleOrientation = (event: DeviceOrientationEvent): void => {
    if (event.alpha === null && event.beta === null && event.gamma === null) return
    const alpha = THREE.MathUtils.degToRad(event.alpha ?? 0)
    const beta = THREE.MathUtils.degToRad(event.beta ?? 0)
    const gamma = THREE.MathUtils.degToRad(event.gamma ?? 0)
    const orient = THREE.MathUtils.degToRad(screen.orientation?.angle ?? 0)

    this.euler.set(beta, alpha, -gamma, 'YXZ')
    this.target.setFromEuler(this.euler)
    this.target.multiply(this.q1)
    this.target.multiply(this.q0.setFromAxisAngle(ZEE, -orient))

    if (this.recenter) {
      this.forward.copy(FORWARD).applyQuaternion(this.target)
      const currentYaw = Math.atan2(-this.forward.x, -this.forward.z)
      const delta = Math.atan2(
        Math.sin(this.spawnYaw - currentYaw),
        Math.cos(this.spawnYaw - currentYaw),
      )
      this.yawOffset.setFromAxisAngle(UP, delta)
      this.recenter = false
    }

    this.target.premultiply(this.yawOffset)
  }
}
