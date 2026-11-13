import * as THREE from 'three'
import {
  calendarTexture,
  cityTexture,
  glowTexture,
  televisionTexture,
  woodTexture,
} from '../textures'

const WIDTH = 6
const DEPTH = 5
const HEIGHT = 3.2

export type Room = {
  root: THREE.Group
  dispose: () => void
}

function slab(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  return mesh
}

export function createRoom(): Room {
  const root = new THREE.Group()
  root.name = 'placeholder-room'

  const floorMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture(4, 3),
    color: 0xb0aca2,
    roughness: 0.86,
  })
  const tableMaterial = new THREE.MeshStandardMaterial({ map: woodTexture(1, 1), roughness: 0.7 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x32333a, roughness: 0.97 })
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 1 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.62 })
  const fabricMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 1 })

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  root.add(floor)

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), ceilingMaterial)
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = HEIGHT
  root.add(ceiling)

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), wallMaterial)
  backWall.position.set(0, HEIGHT / 2, -DEPTH / 2)
  root.add(backWall)

  const frontWall = backWall.clone()
  frontWall.position.z = DEPTH / 2
  frontWall.rotation.y = Math.PI
  root.add(frontWall)

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(DEPTH, HEIGHT), wallMaterial)
  leftWall.position.set(-WIDTH / 2, HEIGHT / 2, 0)
  leftWall.rotation.y = Math.PI / 2
  root.add(leftWall)

  const rightWall = leftWall.clone()
  rightWall.position.x = WIDTH / 2
  rightWall.rotation.y = -Math.PI / 2
  root.add(rightWall)

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 1 }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0.2, 0.01, 0.6)
  root.add(rug)

  const door = slab([0.06, 2.1, 0.92], [-WIDTH / 2 + 0.05, 1.05, 1.62], darkMaterial)
  root.add(door)
  root.add(slab([0.05, 0.05, 0.14], [-WIDTH / 2 + 0.1, 1.02, 1.28], tableMaterial))

  const windowFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8 })
  const view = new THREE.Mesh(
    new THREE.PlaneGeometry(1.72, 1.62),
    new THREE.MeshBasicMaterial({ map: cityTexture() }),
  )
  view.position.set(WIDTH / 2 - 0.02, 1.78, -0.7)
  view.rotation.y = -Math.PI / 2
  root.add(view)

  const frameZ = -0.7
  const frameY = 1.78
  root.add(slab([0.08, 1.8, 0.07], [WIDTH / 2 - 0.05, frameY, frameZ - 0.9], windowFrameMaterial))
  root.add(slab([0.08, 1.8, 0.07], [WIDTH / 2 - 0.05, frameY, frameZ + 0.9], windowFrameMaterial))
  root.add(slab([0.08, 0.07, 1.87], [WIDTH / 2 - 0.05, frameY + 0.88, frameZ], windowFrameMaterial))
  root.add(slab([0.08, 0.07, 1.87], [WIDTH / 2 - 0.05, frameY - 0.88, frameZ], windowFrameMaterial))
  root.add(slab([0.07, 1.72, 0.05], [WIDTH / 2 - 0.05, frameY, frameZ], windowFrameMaterial))

  const calendarTextureMap = calendarTexture()
  const calendar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 1.1),
    new THREE.MeshStandardMaterial({
      map: calendarTextureMap,
      emissive: 0xffffff,
      emissiveMap: calendarTextureMap,
      emissiveIntensity: 0.24,
      roughness: 0.94,
    }),
  )
  calendar.position.set(0.92, 2.02, -DEPTH / 2 + 0.02)
  root.add(calendar)

  const tableTop = slab([1.24, 0.07, 0.78], [0.92, 0.74, -1.86], tableMaterial)
  root.add(tableTop)
  root.add(slab([0.06, 0.72, 0.66], [0.38, 0.36, -1.86], tableMaterial))
  root.add(slab([0.06, 0.72, 0.66], [1.46, 0.36, -1.86], tableMaterial))

  const television = slab([0.64, 0.48, 0.44], [0.92, 1.02, -1.92], darkMaterial)
  root.add(television)
  const screenTexture = televisionTexture()
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.32),
    new THREE.MeshStandardMaterial({
      map: screenTexture,
      emissive: 0xffffff,
      emissiveMap: screenTexture,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    }),
  )
  screen.position.set(0.92, 1.05, -1.69)
  root.add(screen)
  root.add(slab([0.02, 0.2, 0.02], [0.68, 1.24, -1.98], darkMaterial))
  root.add(slab([0.02, 0.2, 0.02], [1.16, 1.24, -1.98], darkMaterial))

  root.add(slab([1.92, 0.42, 0.78], [-1.5, 0.21, -0.55], fabricMaterial))
  root.add(slab([1.92, 0.62, 0.16], [-1.5, 0.62, -0.9], fabricMaterial))
  root.add(slab([0.72, 0.16, 0.62], [-1.88, 0.5, -0.5], fabricMaterial))
  root.add(slab([0.72, 0.16, 0.62], [-1.12, 0.5, -0.5], fabricMaterial))

  const lampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 1.45, 12),
    darkMaterial,
  )
  lampPole.position.set(-2.5, 0.72, -1.5)
  root.add(lampPole)

  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8c79a,
    emissive: 0xffb066,
    emissiveIntensity: 1.4,
    roughness: 0.9,
  })
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 20, 1, true), shadeMaterial)
  shade.position.set(-2.5, 1.5, -1.5)
  shade.rotation.x = Math.PI
  root.add(shade)

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe0b0 }),
  )
  bulb.position.set(0.3, HEIGHT - 0.42, 0.35)
  root.add(bulb)

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffc98a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  glow.scale.set(0.95, 0.95, 1)
  glow.position.copy(bulb.position)
  root.add(glow)

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.4, 6),
    darkMaterial,
  )
  cord.position.set(bulb.position.x, HEIGHT - 0.21, bulb.position.z)
  root.add(cord)

  const fill = new THREE.HemisphereLight(0x5b6c8c, 0x1b1a18, 0.6)
  root.add(fill)

  const ceilingLight = new THREE.PointLight(0xa9bcd8, 14, 12, 2)
  ceilingLight.position.copy(bulb.position)
  root.add(ceilingLight)

  const lampLight = new THREE.PointLight(0xffb066, 10, 7, 2)
  lampLight.position.set(-2.5, 1.42, -1.5)
  root.add(lampLight)

  const windowLight = new THREE.PointLight(0x8fb2e2, 9, 8, 2)
  windowLight.position.set(WIDTH / 2 - 0.45, 1.75, -0.7)
  root.add(windowLight)

  const screenLight = new THREE.PointLight(0xc2ccd2, 1.4, 3, 2)
  screenLight.position.set(0.92, 1.05, -1.5)
  root.add(screenLight)

  const dispose = () => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose()
        }
        material.dispose()
      }
    })
  }

  return { root, dispose }
}
