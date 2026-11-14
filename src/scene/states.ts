import rawStates from './states.json'

export type StateId = keyof typeof rawStates.states

export type Vec3 = {
  x: number
  y: number
  z: number
}

export type StateDef = {
  label: string
  position: Vec3
  facing: string
  interactables: string[] | null
}

export type Transition = {
  a: StateId
  b: StateId
}

export type StatesData = {
  version: number
  spawn: StateId
  coordinateSpace: string
  states: Record<StateId, StateDef>
  objects: Record<string, string>
  transitions: Transition[]
}

const data = rawStates as unknown as StatesData

function fail(message: string): never {
  throw new Error(`states.json: ${message}`)
}

function assertState(id: string): asserts id is StateId {
  if (!Object.prototype.hasOwnProperty.call(data.states, id)) {
    fail(`unknown state "${id}"`)
  }
}

for (const [id, state] of Object.entries(data.states)) {
  const { x, y, z } = state.position
  if (![x, y, z].every((value) => Number.isFinite(value))) {
    fail(`state "${id}" has a non-numeric position`)
  }
}

assertState(data.spawn)

for (const transition of data.transitions) {
  assertState(transition.a)
  assertState(transition.b)
}

export const STATES: StatesData = data

export const STATE_IDS = Object.keys(data.states) as StateId[]

export function getState(id: StateId): StateDef {
  return data.states[id]
}

export function createAdjacency(): Map<StateId, StateId[]> {
  const adjacency = new Map<StateId, StateId[]>(STATE_IDS.map((id) => [id, []]))
  for (const { a, b } of data.transitions) {
    const from = adjacency.get(a)
    const to = adjacency.get(b)
    if (!from || !to) continue
    if (!from.includes(b)) from.push(b)
    if (!to.includes(a)) to.push(a)
  }
  return adjacency
}
