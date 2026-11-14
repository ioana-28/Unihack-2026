import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = '/models/romconfort.glb'
const HIDDEN_PREFIXES = ['BLK_', 'LBL', 'PLT_AST']
const HIDDEN_NAMES = new Set(['CEILING_REVIEW'])
const LIVING_ROOM = {
  minX: 5.7,
  maxX: 10.2,
  minZ: -7.35,
  maxZ: -3.46,
  height: 2.68,
}

export type Room = {
  root: THREE.Group
  isReady: () => boolean
  dispose: () => void
}

function shouldHide(name: string): boolean {
  if (HIDDEN_NAMES.has(name)) return true
  return HIDDEN_PREFIXES.some((prefix) => name.startsWith(prefix))
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

function addLights(root: THREE.Group): void {
  const ambient = new THREE.HemisphereLight(0x9db4d4, 0x2a2119, 0.35)
  root.add(ambient)

  const ceiling = new THREE.PointLight(0xffd7a8, 8, 9, 2)
  ceiling.position.set(7.95, 2.45, -5.4)
  root.add(ceiling)

  const balcony = new THREE.PointLight(0xa9c8ff, 6, 8, 2)
  balcony.position.set(10.15, 1.75, -5.4)
  root.add(balcony)

  const lamp = new THREE.PointLight(0xffb066, 3, 4, 2)
  lamp.position.set(6.35, 1.35, -6.55)
  root.add(lamp)
}

function addPlaceholder(root: THREE.Group): THREE.Group {
  const group = new THREE.Group()
  group.name = 'apartment-placeholder'
  const width = LIVING_ROOM.maxX - LIVING_ROOM.minX
  const depth = LIVING_ROOM.maxZ - LIVING_ROOM.minZ
  const height = LIVING_ROOM.height
  const centerX = (LIVING_ROOM.minX + LIVING_ROOM.maxX) / 2
  const centerZ = (LIVING_ROOM.minZ + LIVING_ROOM.maxZ) / 2
  const wall = new THREE.MeshStandardMaterial({ color: 0x5a544a, roughness: 0.95 })
  const floor = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9 })
  const ceiling = new THREE.MeshStandardMaterial({ color: 0x2a2722, roughness: 1 })

  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floor)
  floorMesh.rotation.x = -Math.PI / 2
  floorMesh.position.set(centerX, 0, centerZ)
  group.add(floorMesh)

  const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceiling)
  ceilingMesh.rotation.x = Math.PI / 2
  ceilingMesh.position.set(centerX, height, centerZ)
  group.add(ceilingMesh)

  const north = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wall)
  north.position.set(centerX, height / 2, LIVING_ROOM.minZ)
  group.add(north)

  const south = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wall)
  south.position.set(centerX, height / 2, LIVING_ROOM.maxZ)
  south.rotation.y = Math.PI
  group.add(south)

  const west = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wall)
  west.position.set(LIVING_ROOM.minX, height / 2, centerZ)
  west.rotation.y = Math.PI / 2
  group.add(west)

  const east = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wall)
  east.position.set(LIVING_ROOM.maxX, height / 2, centerZ)
  east.rotation.y = -Math.PI / 2
  group.add(east)

  root.add(group)
  return group
}

export function createRoom(): Room {
  const root = new THREE.Group()
  root.name = 'apartment'
  addLights(root)
  let placeholder: THREE.Group | null = addPlaceholder(root)

  let model: THREE.Group | null = null
  let ready = false
  let disposed = false

  const loader = new GLTFLoader()
  loader.load(
    MODEL_URL,
    (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene)
        return
      }
      gltf.scene.traverse((object) => {
        if (shouldHide(object.name)) object.visible = false
      })
      model = gltf.scene
      if (placeholder) {
        root.remove(placeholder)
        disposeObject(placeholder)
        placeholder = null
      }
      root.add(model)
      ready = true
    },
    undefined,
    (error: unknown) => {
      console.error('Failed to load the apartment model', error)
      ready = true
    },
  )

  const dispose = (): void => {
    disposed = true
    if (model) {
      root.remove(model)
      disposeObject(model)
      model = null
    }
    if (placeholder) {
      root.remove(placeholder)
      disposeObject(placeholder)
      placeholder = null
    }
  }

  return { root, isReady: () => ready, dispose }
}
