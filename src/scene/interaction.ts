import * as THREE from 'three'
import { createAdjacency, getState, STATE_IDS, STATES } from './states'
import type { StateId } from './states'
import type { Reticle } from './reticle'

const DWELL_SECONDS = 1.5
const MARKER_Y = 0.03
const MARKER_OPACITY = 0.55
const HIT_RADIUS = 0.2
const CLICK_SLOP = 5
const RAYCAST_INTERVAL = 0.1
const FLASH_MS = 800
const ORIGIN = new THREE.Vector2(0, 0)

type Marker = {
  group: THREE.Group
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  hit: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
}

type GazeTarget =
  | { kind: 'state'; id: StateId }
  | { kind: 'object'; key: string; prompt: string }

type Interactable = {
  key: string
  prompt: string
}

export type InteractionMode = 'desktop' | 'vr'

export type InteractionOptions = {
  camera: THREE.PerspectiveCamera
  rig: THREE.Object3D
  world: THREE.Object3D
  room: THREE.Object3D
  isRoomReady: () => boolean
  reticle: Reticle
  canvas: HTMLCanvasElement
  onDesktopArrive?: (eyeHeight: number) => void
}

export type InteractionController = {
  update: (delta: number) => void
  setEnabled: (enabled: boolean) => void
  setMode: (mode: InteractionMode) => void
  reset: () => void
  dispose: () => void
  currentStateId: () => StateId
}

function isVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function createMarker(id: StateId): Marker {
  const state = getState(id)
  const group = new THREE.Group()
  group.name = `teleport-marker:${id}`
  group.position.set(state.position.x, state.markerY ?? MARKER_Y, state.position.z)
  group.visible = false

  const material = new THREE.MeshBasicMaterial({
    color: 0xf4c583,
    transparent: true,
    opacity: MARKER_OPACITY,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.115, 40), material)
  ring.rotation.x = -Math.PI / 2
  ring.renderOrder = 5

  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    colorWrite: false,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const hit = new THREE.Mesh(new THREE.CircleGeometry(HIT_RADIUS, 32), hitMaterial)
  hit.rotation.x = -Math.PI / 2

  group.add(ring, hit)
  return { group, ring, hit }
}

export function createInteractionController(
  options: InteractionOptions,
): InteractionController {
  const { camera, rig, world, room, isRoomReady, reticle, canvas, onDesktopArrive } = options

  const adjacency = createAdjacency()
  const markers = new Map<StateId, Marker>()
  const stateForHit = new Map<THREE.Object3D, StateId>()
  const rootForKey = new Map<THREE.Object3D, Interactable>()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const destination = new THREE.Vector3()

  const markersRoot = new THREE.Group()
  markersRoot.name = 'teleport-markers'
  world.add(markersRoot)

  for (const id of STATE_IDS) {
    const marker = createMarker(id)
    markers.set(id, marker)
    stateForHit.set(marker.hit, id)
    markersRoot.add(marker.group)
  }

  let current = STATES.spawn
  let mode: InteractionMode = 'desktop'
  let active = false
  let target: GazeTarget | null = null
  let interactableRoots: THREE.Object3D[] = []
  let dwell = 0
  let armed = true
  let flashUntil = 0
  let rayTimer = 0
  let resolved = false
  let hitTargets: THREE.Object3D[] = []
  let pointerDownX = 0
  let pointerDownY = 0

  const adjacentTo = (id: StateId): StateId[] => adjacency.get(id) ?? []

  const resetProgress = (): void => {
    for (const marker of markers.values()) {
      marker.ring.scale.setScalar(1)
      marker.ring.material.opacity = MARKER_OPACITY
    }
  }

  const resolveInteractables = (): void => {
    rootForKey.clear()
    interactableRoots = []
    const prompts = getState(current).interactables
    if (!prompts) return
    for (const [key, prompt] of Object.entries(prompts)) {
      const nodeName = STATES.objects[key]
      if (!nodeName) continue
      const sanitized = THREE.PropertyBinding.sanitizeNodeName(nodeName)
      const node = room.getObjectByName(sanitized) ?? room.getObjectByName(nodeName)
      if (!node) {
        console.warn(`Interaction: object "${nodeName}" for "${key}" not found`)
        continue
      }
      rootForKey.set(node, { key, prompt })
      interactableRoots.push(node)
    }
  }

  const updatePrompt = (): void => {
    if (flashUntil > performance.now()) {
      reticle.setPrompt('ok')
      return
    }
    if (armed && target?.kind === 'object') {
      reticle.setPrompt(target.prompt)
      return
    }
    reticle.setPrompt(null)
  }

  const clearGaze = (): void => {
    target = null
    dwell = 0
    armed = true
    flashUntil = 0
    reticle.setProgress(0)
    reticle.setPrompt(null)
  }

  const refresh = (): void => {
    const adjacent = new Set(adjacentTo(current))
    hitTargets = []
    for (const [id, marker] of markers) {
      const show = active && id !== current && adjacent.has(id)
      marker.group.visible = show
      if (show) hitTargets.push(marker.hit)
    }

    resolved = false
    rootForKey.clear()
    interactableRoots = []
    if (isRoomReady()) {
      resolveInteractables()
      resolved = true
    }

    clearGaze()
    resetProgress()
  }

  const teleportTo = (id: StateId): void => {
    const state = getState(id)
    world.updateMatrixWorld(true)
    destination.set(state.position.x, state.position.y, state.position.z)
    world.localToWorld(destination)

    if (mode === 'vr') {
      rig.position.copy(destination)
    } else {
      rig.position.set(0, 0, 0)
      camera.position.copy(destination)
      onDesktopArrive?.(destination.y)
    }

    current = id
    refresh()
  }

  const sameTarget = (a: GazeTarget | null, b: GazeTarget | null): boolean => {
    if (a === null || b === null) return a === b
    if (a.kind !== b.kind) return false
    if (a.kind === 'state' && b.kind === 'state') return a.id === b.id
    if (a.kind === 'object' && b.kind === 'object') return a.key === b.key
    return false
  }

  const resolveObject = (object: THREE.Object3D): Interactable | null => {
    let currentObject: THREE.Object3D | null = object
    while (currentObject && currentObject !== room) {
      const entry = rootForKey.get(currentObject)
      if (entry) return entry
      currentObject = currentObject.parent
    }
    return null
  }

  const acquire = (): GazeTarget | null => {
    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)
    raycaster.setFromCamera(ORIGIN, camera)

    const candidates: THREE.Object3D[] = hitTargets.slice()
    if (interactableRoots.length > 0) candidates.push(room)
    const hits = raycaster.intersectObjects(candidates, true)

    for (const hit of hits) {
      if (!isVisible(hit.object)) continue
      const stateId = stateForHit.get(hit.object)
      if (stateId) return { kind: 'state', id: stateId }
      const interactable = resolveObject(hit.object)
      if (interactable) {
        return { kind: 'object', key: interactable.key, prompt: interactable.prompt }
      }
      return null
    }
    return null
  }

  const update = (delta: number): void => {
    if (!active) return

    if (!resolved && isRoomReady()) {
      resolveInteractables()
      resolved = true
    }

    if (flashUntil > 0 && performance.now() >= flashUntil) {
      flashUntil = 0
      updatePrompt()
    }

    rayTimer += delta
    if (rayTimer >= RAYCAST_INTERVAL) {
      rayTimer = 0
      const next = acquire()
      if (!sameTarget(next, target)) {
        target = next
        dwell = 0
        flashUntil = 0
        resetProgress()
        reticle.setProgress(0)
        if (next === null) armed = true
        updatePrompt()
      }
    }

    if (!target) return

    if (target.kind === 'state') {
      dwell += delta
      const progress = Math.min(dwell / DWELL_SECONDS, 1)
      const marker = markers.get(target.id)
      if (marker) {
        marker.ring.scale.setScalar(1 + progress * 0.35)
        marker.ring.material.opacity = MARKER_OPACITY + (1 - MARKER_OPACITY) * progress
      }
      if (dwell >= DWELL_SECONDS) teleportTo(target.id)
      return
    }

    if (!armed) return

    dwell += delta
    const progress = Math.min(dwell / DWELL_SECONDS, 1)
    reticle.setProgress(progress)
    if (dwell >= DWELL_SECONDS) {
      console.log('ok')
      armed = false
      dwell = 0
      flashUntil = performance.now() + FLASH_MS
      reticle.setProgress(0)
      reticle.setPrompt('ok')
    }
  }

  const pickFromPointer = (event: PointerEvent): StateId | null => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(hitTargets, false)
    for (const hit of hits) {
      const id = stateForHit.get(hit.object)
      if (id) return id
    }
    return null
  }

  const setEnabled = (enabled: boolean): void => {
    active = enabled
    if (enabled) {
      refresh()
      return
    }
    target = null
    dwell = 0
    armed = true
    flashUntil = 0
    hitTargets = []
    reticle.setProgress(0)
    reticle.setPrompt(null)
    resetProgress()
    for (const marker of markers.values()) marker.group.visible = false
  }

  const setMode = (next: InteractionMode): void => {
    mode = next
    clearGaze()
    resetProgress()
  }

  const reset = (): void => {
    current = STATES.spawn
    clearGaze()
    resetProgress()
    if (active) refresh()
  }

  const handlePointerDown = (event: PointerEvent): void => {
    if (!active || mode !== 'desktop' || event.button !== 0) return
    pointerDownX = event.clientX
    pointerDownY = event.clientY
  }

  const handlePointerUp = (event: PointerEvent): void => {
    if (!active || mode !== 'desktop' || event.button !== 0) return
    if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > CLICK_SLOP) return
    const id = pickFromPointer(event)
    if (id) teleportTo(id)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!active || mode !== 'desktop') return
    if (!/^Digit[1-9]$/.test(event.code)) return
    const index = Number(event.code.slice(5)) - 1
    const ids = STATE_IDS.filter((id) => adjacentTo(current).includes(id))
    const id = ids[index]
    if (!id) return
    event.preventDefault()
    teleportTo(id)
  }

  canvas.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  window.addEventListener('keydown', handleKeyDown)

  const dispose = (): void => {
    canvas.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerUp)
    window.removeEventListener('keydown', handleKeyDown)
    world.remove(markersRoot)
    for (const marker of markers.values()) {
      marker.ring.geometry.dispose()
      marker.ring.material.dispose()
      marker.hit.geometry.dispose()
      marker.hit.material.dispose()
    }
  }

  return {
    update,
    setEnabled,
    setMode,
    reset,
    dispose,
    currentStateId: () => current,
  }
}
