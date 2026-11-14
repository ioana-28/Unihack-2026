import * as THREE from 'three'

const ZEE = new THREE.Vector3(0, 0, 1)

export class OrientationControls {
  private readonly camera: THREE.PerspectiveCamera
  private readonly euler = new THREE.Euler()
  private readonly target = new THREE.Quaternion()
  private readonly q0 = new THREE.Quaternion()
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  private enabled = false

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (enabled) {
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
  }
}
