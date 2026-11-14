import * as THREE from 'three'
import { createAdjacency, getState, STATE_IDS, STATES } from './states'
import type { StateId } from './states'

const DWELL_SECONDS = 1.5
const MARKER_Y = 0.03
const MARKER_OPACITY = 0.55
const HIT_RADIUS = 0.2
const CLICK_SLOP = 5
const ORIGIN = new THREE.Vector2(0, 0)

type Marker = {
  group: THREE.Group
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  hit: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
}

export type TeleportMode = 'desktop' | 'vr'

export type TeleportOptions = {
  camera: THREE.PerspectiveCamera
  rig: THREE.Object3D
  world: THREE.Object3D
  canvas: HTMLCanvasElement
  onDesktopArrive?: (eyeHeight: number) => void
}

export type TeleportController = {
  update: (delta: number) => void
  setEnabled: (enabled: boolean) => void
  setMode: (mode: TeleportMode) => void
  reset: () => void
  dispose: () => void
  currentStateId: () => StateId
}

function createMarker(id: StateId): Marker {
  const state = getState(id)
  const group = new THREE.Group()
  group.name = `teleport-marker:${id}`
  group.position.set(state.position.x, MARKER_Y, state.position.z)
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

export function createTeleportController(options: TeleportOptions): TeleportController {
  const { camera, rig, world, canvas, onDesktopArrive } = options

  const adjacency = createAdjacency()
  const markers = new Map<StateId, Marker>()
  const stateForHit = new Map<THREE.Object3D, StateId>()
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
  let mode: TeleportMode = 'desktop'
  let active = false
  let target: StateId | null = null
  let dwell = 0
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

  const refresh = (): void => {
    const adjacent = new Set(adjacentTo(current))
    hitTargets = []
    for (const [id, marker] of markers) {
      const show = active && id !== current && adjacent.has(id)
      marker.group.visible = show
      if (show) hitTargets.push(marker.hit)
    }
    target = null
    dwell = 0
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

  const setTarget = (id: StateId | null, delta: number): void => {
    if (id !== target) {
      target = id
      dwell = 0
      resetProgress()
    }
    if (!id) return

    dwell += delta
    const progress = Math.min(dwell / DWELL_SECONDS, 1)
    const marker = markers.get(id)
    if (marker) {
      marker.ring.scale.setScalar(1 + progress * 0.35)
      marker.ring.material.opacity = MARKER_OPACITY + (1 - MARKER_OPACITY) * progress
    }
    if (dwell >= DWELL_SECONDS) teleportTo(id)
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

  const update = (delta: number): void => {
    if (!active || mode !== 'vr') return
    camera.updateMatrixWorld()
    world.updateMatrixWorld(true)
    raycaster.setFromCamera(ORIGIN, camera)
    const hits = raycaster.intersectObjects(hitTargets, false)
    let id: StateId | null = null
    for (const hit of hits) {
      const found = stateForHit.get(hit.object)
      if (found && adjacentTo(current).includes(found)) {
        id = found
        break
      }
    }
    setTarget(id, delta)
  }

  const setEnabled = (enabled: boolean): void => {
    active = enabled
    if (enabled) {
      refresh()
      return
    }
    target = null
    dwell = 0
    hitTargets = []
    resetProgress()
    for (const marker of markers.values()) marker.group.visible = false
  }

  const setMode = (next: TeleportMode): void => {
    mode = next
    target = null
    dwell = 0
    resetProgress()
  }

  const reset = (): void => {
    current = STATES.spawn
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
