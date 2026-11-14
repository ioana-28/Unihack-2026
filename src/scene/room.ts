import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  dropCached,
  fetchCachedArrayBuffer,
  requestPersistentStorage,
  type LoadProgress,
} from '../cache'

const MODEL_VERSION = '2026-11-14'
const DEFAULT_MODEL_URL = `/models/romconfort.glb?v=${MODEL_VERSION}`
const MODEL_URL =
  new URLSearchParams(window.location.search).get('model') ?? DEFAULT_MODEL_URL
const MODEL_CACHE = `apartment-model-${MODEL_VERSION}`
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500
const HIDDEN_PREFIXES = ['BLK_', 'LBL', 'PLT_AST']
const HIDDEN_NAMES = new Set(['CEILING_REVIEW'])
const LIVING_ROOM = {
  minX: 5.7,
  maxX: 10.2,
  minZ: -7.35,
  maxZ: -3.46,
  height: 2.68,
}

export type ModelProgress = LoadProgress

export type Room = {
  root: THREE.Group
  isReady: () => boolean
  getProgress: () => ModelProgress
  getError: () => unknown | null
  retry: () => void
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

  const hall = new THREE.PointLight(0xffd2a1, 6, 7, 2)
  hall.position.set(5.05, 2.4, -3.05)
  root.add(hall)

  const hallEntry = new THREE.PointLight(0xffc98f, 4, 5, 2)
  hallEntry.position.set(6.25, 2.4, -1.8)
  root.add(hallEntry)

  const kitchen = new THREE.PointLight(0xffe0b0, 7, 6, 2)
  kitchen.position.set(8.5, 2.4, -2.7)
  root.add(kitchen)

  const bathroom = new THREE.PointLight(0xd7e6ff, 5, 5, 2)
  bathroom.position.set(4.6, 2.4, -5.7)
  root.add(bathroom)
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function parseModel(loader: GLTFLoader, buffer: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
  })
}

export function createRoom(): Room {
  const root = new THREE.Group()
  root.name = 'apartment'
  addLights(root)
  let placeholder: THREE.Group | null = addPlaceholder(root)

  const loader = new GLTFLoader()
  let model: THREE.Group | null = null
  let ready = false
  let disposed = false
  let error: unknown | null = null
  let progress: ModelProgress = { loaded: 0, total: 0 }
  let request: AbortController | null = null

  const load = async (): Promise<void> => {
    if (disposed || model) return
    request?.abort()
    request = new AbortController()
    ready = false
    error = null
    progress = { loaded: 0, total: 0 }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const buffer = await fetchCachedArrayBuffer(MODEL_URL, {
          cacheName: MODEL_CACHE,
          contentType: 'model/gltf-binary',
          signal: request.signal,
          onProgress: (next) => {
            progress = next
          },
        })
        if (disposed) return

        const scene = await parseModel(loader, buffer)
        if (disposed) {
          disposeObject(scene)
          return
        }

        scene.traverse((object) => {
          if (shouldHide(object.name)) object.visible = false
        })
        model = scene
        if (placeholder) {
          root.remove(placeholder)
          disposeObject(placeholder)
          placeholder = null
        }
        root.add(model)
        progress = { loaded: progress.total, total: progress.total }
        ready = true
        void requestPersistentStorage()
        return
      } catch (loadError) {
        if (disposed || request.signal.aborted) return
        error = loadError
        console.error(
          `Failed to load the apartment model (attempt ${attempt}/${MAX_ATTEMPTS})`,
          loadError,
        )
        await dropCached(MODEL_CACHE, MODEL_URL)
        if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS * attempt)
      }
    }

    ready = true
  }

  void load()

  const dispose = (): void => {
    disposed = true
    request?.abort()
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

  return {
    root,
    isReady: () => ready,
    getProgress: () => progress,
    getError: () => error,
    retry: () => {
      if (!disposed) void load()
    },
    dispose,
  }
}
