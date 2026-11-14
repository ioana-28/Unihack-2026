import * as THREE from 'three'
import { createAdjacency, getState, STATES } from './states'
import type { StateId } from './states'
import type { Reticle } from './reticle'

const DWELL_SECONDS = 1.5
const NAV_GAZE_ANGLE = THREE.MathUtils.degToRad(20)
const NAV_MIN_DISTANCE = 0.6
const CLICK_RADIUS = 0.18
const CLICK_SLOP = 5
const RAYCAST_INTERVAL = 0.15
const FLASH_MS = 800
const ORIGIN = new THREE.Vector2(0, 0)

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

export function createInteractionController(
  options: InteractionOptions,
): InteractionController {
  const { camera, rig, world, room, isRoomReady, reticle, canvas, onDesktopArrive } = options

  const adjacency = createAdjacency()
  const stateWorldPositions = new Map<StateId, THREE.Vector3>()
  const rootForKey = new Map<THREE.Object3D, Interactable>()
  const raycaster = new THREE.Raycaster()
  const destination = new THREE.Vector3()
  const eye = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const toTarget = new THREE.Vector3()
  const projected = new THREE.Vector3()
  const cameraSpace = new THREE.Vector3()

  let current = STATES.spawn
  let mode: InteractionMode = 'desktop'
  let active = false
  let target: GazeTarget | null = null
  let interactableRoots: THREE.Object3D[] = []
  let navigationIds: StateId[] = []
  let dwell = 0
  let armed = true
  let flashUntil = 0
  let rayTimer = 0
  let resolved = false
  let pointerDownX = 0
  let pointerDownY = 0

  const adjacentTo = (id: StateId): StateId[] => adjacency.get(id) ?? []

  const navigationLabel = (id: StateId): string => {
    const state = getState(id)
    return state.tag ?? state.label
  }

  const updateNavigationTargets = (): void => {
    navigationIds = adjacentTo(current)
    world.updateMatrixWorld(true)
    for (const id of navigationIds) {
      const state = getState(id)
      let point = stateWorldPositions.get(id)
      if (!point) {
        point = new THREE.Vector3()
        stateWorldPositions.set(id, point)
      }
      point.set(state.position.x, state.position.y, state.position.z)
      world.localToWorld(point)
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
    if (target?.kind !== 'object') {
      reticle.setPrompt(null)
      return
    }
    reticle.setPrompt(armed ? target.prompt : null)
  }

  const clearGaze = (): void => {
    target = null
    dwell = 0
    armed = true
    flashUntil = 0
    reticle.setProgress(0)
    reticle.setPrompt(null)
    reticle.setNavigation(null, 0)
  }

  const refresh = (): void => {
    resolved = false
    rootForKey.clear()
    interactableRoots = []
    if (isRoomReady()) {
      resolveInteractables()
      resolved = true
    }

    updateNavigationTargets()
    clearGaze()
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

  const resolveInteractableRoot = (object: THREE.Object3D): THREE.Object3D | null => {
    let currentObject: THREE.Object3D | null = object
    while (currentObject && currentObject !== room) {
      if (rootForKey.has(currentObject)) return currentObject
      currentObject = currentObject.parent
    }
    return null
  }

  const contains = (rootObject: THREE.Object3D, object: THREE.Object3D): boolean => {
    let currentObject: THREE.Object3D | null = object
    while (currentObject) {
      if (currentObject === rootObject) return true
      currentObject = currentObject.parent
    }
    return false
  }

  const isOccluded = (hit: THREE.Intersection, rootObject: THREE.Object3D | null): boolean => {
    const occluders = raycaster.intersectObject(room, true)
    for (const occluder of occluders) {
      if (!isVisible(occluder.object)) continue
      if (occluder.distance >= hit.distance - 0.01) return false
      if (rootObject && contains(rootObject, occluder.object)) return false
      return true
    }
    return false
  }

  const acquireObject = (): GazeTarget | null => {
    if (interactableRoots.length === 0) return null
    raycaster.setFromCamera(ORIGIN, camera)
    const hits = raycaster.intersectObject(room, true)
    for (const hit of hits) {
      if (!isVisible(hit.object)) continue
      const interactable = resolveObject(hit.object)
      if (interactable) {
        if (isOccluded(hit, resolveInteractableRoot(hit.object))) return null
        return { kind: 'object', key: interactable.key, prompt: interactable.prompt }
      }
    }
    return null
  }

  const acquireNavigation = (): GazeTarget | null => {
    if (navigationIds.length === 0) return null

    camera.getWorldPosition(eye)
    camera.getWorldDirection(forward)

    let best: StateId | null = null
    let bestAngle = NAV_GAZE_ANGLE

    for (const id of navigationIds) {
      const point = stateWorldPositions.get(id)
      if (!point) continue
      toTarget.subVectors(point, eye)
      const distance = toTarget.length()
      if (distance < NAV_MIN_DISTANCE) continue
      toTarget.multiplyScalar(1 / distance)
      const angle = Math.acos(THREE.MathUtils.clamp(toTarget.dot(forward), -1, 1))
      if (angle >= bestAngle) continue
      best = id
      bestAngle = angle
    }

    return best ? { kind: 'state', id: best } : null
  }

  const acquire = (): GazeTarget | null => {
    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)
    return acquireObject() ?? acquireNavigation()
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
        reticle.setProgress(0)
        reticle.setNavigation(next?.kind === 'state' ? navigationLabel(next.id) : null, 0)
        if (next === null) armed = true
        updatePrompt()
      }
    }

    if (!target) return

    if (target.kind === 'state') {
      dwell += delta
      reticle.setNavigation(navigationLabel(target.id), Math.min(dwell / DWELL_SECONDS, 1))
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

    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const radius = Math.min(rect.width, rect.height) * CLICK_RADIUS
    let best: StateId | null = null
    let bestDistance = radius

    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)

    for (const id of navigationIds) {
      const point = stateWorldPositions.get(id)
      if (!point) continue
      cameraSpace.copy(point).applyMatrix4(camera.matrixWorldInverse)
      if (cameraSpace.z >= 0) continue
      projected.copy(point).project(camera)
      const px = (projected.x * 0.5 + 0.5) * rect.width
      const py = (-projected.y * 0.5 + 0.5) * rect.height
      const distance = Math.hypot(x - px, y - py)
      if (distance >= bestDistance) continue
      best = id
      bestDistance = distance
    }

    return best
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
    reticle.setProgress(0)
    reticle.setPrompt(null)
    reticle.setNavigation(null, 0)
  }

  const setMode = (next: InteractionMode): void => {
    mode = next
    clearGaze()
  }

  const reset = (): void => {
    current = STATES.spawn
    clearGaze()
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
    const id = navigationIds[index]
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
