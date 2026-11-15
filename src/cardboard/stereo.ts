import * as THREE from 'three'

export class StereoEffect {
  private readonly stereo = new THREE.StereoCamera()
  private readonly size = new THREE.Vector2()

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.stereo.aspect = 0.5
  }

  setMono(mono: boolean): void {
    this.stereo.eyeSep = mono ? 0 : 0.064
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    scene.updateMatrixWorld()
    if (camera.parent === null) camera.updateMatrixWorld()

    this.stereo.update(camera)

    const autoClear = this.renderer.autoClear
    this.renderer.getSize(this.size)

    this.renderer.autoClear = false
    this.renderer.clear()
    this.renderer.setScissorTest(true)

    this.renderer.setScissor(0, 0, this.size.width / 2, this.size.height)
    this.renderer.setViewport(0, 0, this.size.width / 2, this.size.height)
    this.renderer.render(scene, this.stereo.cameraL)

    this.renderer.setScissor(this.size.width / 2, 0, this.size.width / 2, this.size.height)
    this.renderer.setViewport(this.size.width / 2, 0, this.size.width / 2, this.size.height)
    this.renderer.render(scene, this.stereo.cameraR)

    this.renderer.setScissorTest(false)
    this.renderer.autoClear = autoClear
  }
}
