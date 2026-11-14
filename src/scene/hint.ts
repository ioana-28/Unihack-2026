import * as THREE from 'three'
import { canvasTexture } from '../textures'

export type HintPanel = {
  object: THREE.Mesh
  material: THREE.MeshBasicMaterial
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export function createHintPanel(): HintPanel {
  const texture = canvasTexture(1024, 256, (ctx, width, height) => {
    roundedRect(ctx, 3, 3, width - 6, height - 6, 34)
    ctx.fillStyle = 'rgba(9, 9, 8, 0.88)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224, 160, 68, 0.55)'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f3e8d3'
    ctx.font = '500 54px system-ui, "Segoe UI", sans-serif'
    ctx.fillText('Ține privirea 1,5 secunde', width / 2, 96)

    ctx.fillStyle = '#c2b49b'
    ctx.font = '400 38px system-ui, "Segoe UI", sans-serif'
    ctx.fillText('ca să interacționezi cu un obiect', width / 2, 166)
  })

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })

  const object = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.245), material)
  object.renderOrder = 20
  object.visible = false

  return { object, material }
}
