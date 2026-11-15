import * as THREE from 'three'
import { getState, STATES } from '../scene/states'
import type { StateId, Vec3 } from '../scene/states'
import type { GameAudio, Playback } from './audio'
import { createDay16Extension } from './day16'
import type { Day16Extension } from './day16'
import { createDay18Extension } from './day18'
import type { Day18Extension } from './day18'
import { loadDay } from './days'
import type { Overlay } from './overlay'
import type { RoomFx } from './room-fx'
import { beginDay, gameState, resetGame } from './state'
import type { Actiune, Ambient, Indiciu, ObiectId, Pas, ZiData } from './types'

// Generic, data-driven day runner: executes data/zNN.json step by step.
//
// Rules (state machine §1):
// - A step with `obiect` waits until the player gazes at that object; only it
//   (plus the calendar and the day's optional objects) is active meanwhile.
// - A step with `suna` rings: the ring loops and ONLY that object is active.
// - While a scene runs (actions, close-up, transition) everything is locked.
// - The calendar is always gazeable outside scenes; it ends the day only when
//   the required steps and flags are done, otherwise it refuses.

/** Romanian object names (day files) → interaction keys in states.json. */
const KEYS: Record<ObiectId, string> = {
  radio: 'radio',
  telefon: 'phone',
  fereastra: 'window',
  usa: 'entryDoor',
  ziar: 'newspaper',
  calendar: 'calendar',
  frigider: 'fridge',
  televizor: 'tv',
}
const OBIECT_FOR_KEY = new Map(Object.entries(KEYS).map(([id, key]) => [key, id as ObiectId]))

const HINT_SECONDS = 5
const MISSING_VOICE_SECONDS = 4
const POSITIONAL_VOICE_VOLUME = 1.6
const FADE_MOVE = 0.3
const BACK_DWELL = 1.5

class Cancelled extends Error {}

type Hint = { text: string; next: number; repeat: number | null; until?: () => boolean }

export type RunnerDeps = {
  audio: GameAudio
  overlay: Overlay
  fx: RoomFx
  camera: THREE.Camera
  /** The apartment root (model coordinates). */
  room: THREE.Object3D
  isRoomReady: () => boolean
  currentPosition: () => StateId
  moveTo: (id: StateId) => void
  /** Moves the player to a point (model coordinates) without changing the position. */
  moveToPoint: (point: Vec3) => void
  /** The game is over for now: go back to the start screen. */
  onFinished: () => void
  /** True while an immersive XR session is presenting. */
  isXR?: () => boolean
}

const now = (): number => performance.now() / 1000

// ---------- Extension point: action types added by separate modules (e.g. day 17).

/** Temporary override of the lock rules while an extension action runs. */
export type ExtensionControl = {
  isActive: (key: string) => boolean
  navigationLocked: () => boolean
}

export type ActionContext = {
  deps: RunnerDeps
  /** Cancellable wait; throws if the day is stopped meanwhile. */
  wait: (seconds: number) => Promise<void>
  /** Awaits a promise, then throws if the day was stopped meanwhile. */
  check: <T>(promise: Promise<T>) => Promise<T>
  /** Runs nested actions from the day file (built-in or registered). */
  run: (actions: unknown[]) => Promise<void>
  /** Model node of a day-file object (radio, telefon, …), if any. */
  node: (id: string) => THREE.Object3D | null
  /** Overrides who is active / whether navigation is locked; null restores the normal rules. */
  setControl: (control: ExtensionControl | null) => void
  /** Called every frame (time in seconds) until the day stops. */
  onFrame: (callback: (time: number, delta: number) => void) => () => void
  /** Called when the day stops (leaving the game, next day). */
  onCleanup: (callback: () => void) => void
  /** True while a scene, a ringing object or an override locks the room. */
  isLocked: () => boolean
}

export type ActionHandler = (action: Record<string, unknown>, ctx: ActionContext) => Promise<void> | void

const extensionActions = new Map<string, ActionHandler>()

/** Registers a new action type for the day files; built-in types cannot be replaced. */
export function registerAction(tip: string, handler: ActionHandler): void {
  extensionActions.set(tip, handler)
}

export class DayRunner {
  private readonly deps: RunnerDeps
  private day: ZiData | null = null
  private generation = 0
  private running = false
  private scene = false
  private ringing: ObiectId | null = null
  private waitingFor: ObiectId | null = null
  private waiter: { obiect: ObiectId; resolve: () => void } | null = null
  private readonly optional = new Set<ObiectId>()
  private hints: Hint[] = []
  private ambient: { spec: Ambient; playback: Playback | null }[] = []
  private readonly nodes = new Map<ObiectId, THREE.Object3D>()
  private readonly extra: Day16Extension
  private readonly day18: Day18Extension
  private control: ExtensionControl | null = null
  private frameCallbacks = new Set<(time: number, delta: number) => void>()
  private cleanups: (() => void)[] = []
  private lastTime = 0

  constructor(deps: RunnerDeps) {
    this.deps = deps
    this.extra = createDay16Extension({
      audio: deps.audio,
      overlay: deps.overlay,
      fx: deps.fx,
      camera: deps.camera,
      room: deps.room,
      isXR: deps.isXR,
    })
    this.day18 = createDay18Extension({
      audio: deps.audio,
      overlay: deps.overlay,
      fx: deps.fx,
      camera: deps.camera,
      room: deps.room,
    })
  }

  // ---------- Hooks for the interaction controller

  /** Can the player use this object right now? */
  isActive(key: string): boolean {
    const id = OBIECT_FOR_KEY.get(key)
    if (!id || !this.day || !this.running) return false
    if (this.control) return this.control.isActive(key)
    if (this.scene) return false
    if (this.ringing) return id === this.ringing
    if (id === this.waitingFor) return true
    if (this.optional.has(id)) {
      const entry = this.day.obiecte?.[id]
      if (!entry) return false
      return !entry.curent || this.deps.fx.hasPower()
    }
    return id === 'calendar'
  }

  isNavigationLocked(): boolean {
    if (!this.running) return false
    if (this.control) return this.control.navigationLocked()
    if (this.scene) return true
    // While something rings, stay put, unless it can't be reached from here.
    if (this.ringing) return this.reachable(this.ringing)
    return false
  }

  onActivate(key: string): void {
    const id = OBIECT_FOR_KEY.get(key)
    const day = this.day
    if (!id || !day || !this.isActive(key)) return
    if (this.waiter?.obiect === id) {
      const waiter = this.waiter
      this.waiter = null
      waiter.resolve()
      return
    }
    const gen = this.generation
    if (id === 'calendar') {
      void this.guard(this.useCalendar(day, gen))
      return
    }
    const actions = day.obiecte?.[id]?.actiuni
    if (actions && this.optional.has(id)) void this.guard(this.runScene(actions, gen))
  }

  // ---------- Lifecycle

  /** Starts a day from its data file; returns false if the file does not exist. */
  async start(zi: number): Promise<boolean> {
    this.stop()
    const gen = this.generation
    while (!this.deps.isRoomReady()) {
      await this.wait(0.25, gen).catch(() => undefined)
      if (gen !== this.generation) return false
    }
    const day = await loadDay(zi)
    if (gen !== this.generation) return false
    if (!day) {
      console.warn(`[day] data/z${zi}.json not found.`)
      return false
    }
    if (zi === 15) resetGame()
    void this.guard(this.runDay(day, gen))
    return true
  }

  stop(): void {
    this.generation += 1
    this.running = false
    this.day = null
    this.scene = false
    this.ringing = null
    this.waitingFor = null
    this.waiter?.resolve()
    this.waiter = null
    this.optional.clear()
    this.hints = []
    this.ambient = []
    this.deps.audio.stopAll()
    this.extra.reset()
    this.day18.reset()
    this.deps.overlay.clearText()
    this.deps.overlay.setBlack(false)
    this.control = null
    this.frameCallbacks.clear()
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.deps.fx.reset()
  }

  update(time: number): void {
    if (!this.running) return
    const delta = Math.min(0.1, Math.max(0, time - this.lastTime))
    this.lastTime = time
    const pulse = 0.05 + 0.1 * (0.5 + 0.5 * Math.sin(time * 2.6))
    for (const [id, node] of this.nodes) {
      this.deps.fx.setGlow(node, this.glows(id) ? pulse : 0)
    }
    // Extension glows are applied after the day's own glow so they win for
    // objects the runner also knows (e.g. the front door in day 17).
    for (const callback of [...this.frameCallbacks]) callback(time, delta)
    this.updateHints()
  }

  // ---------- Day flow

  private async runDay(day: ZiData, gen: number): Promise<void> {
    const { fx, overlay } = this.deps
    beginDay(day.zi)
    this.day = day
    this.resolveNodes()
    for (const id of day.optionale ?? []) this.optional.add(id)

    const spawn = this.spawnId(day)
    const spawnPos = getState(spawn).position
    const viewer = new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z)
    fx.setLighting(day.lumina)
    fx.setPower(true)
    fx.setupWindow(this.nodes.get('fereastra') ?? null, viewer)
    void fx.setWindowView(day.fereastra)
    fx.setupTv(this.nodes.get('televizor') ?? null, viewer)

    overlay.setBlack(true)
    this.deps.moveTo(spawn)
    overlay.snap()
    this.running = true
    this.scene = true
    this.ambient = (day.ambient ?? []).map((spec) => ({ spec, playback: null }))
    this.applyAmbient()

    await this.runActions(day.start ?? [], gen)
    await this.check(overlay.fade(0, 1), gen)
    this.scene = false

    for (const step of day.pasi) await this.runStep(step, gen)
    // The day stays open: free time until the calendar ends it.
  }

  private async runStep(step: Pas, gen: number): Promise<void> {
    gameState.pas = step.id
    for (const id of step.activeaza ?? []) this.optional.add(id)
    const hint = step.indiciu ? this.addHint(step.indiciu) : null

    if (step.obiect) {
      let ring: Playback | null = null
      if (step.suna) {
        this.ringing = step.obiect
        ring = this.deps.audio.play(step.suna.src, {
          at: this.nodes.get(step.obiect),
          loop: true,
          volume: step.suna.volum ?? 1,
        })
      } else {
        this.waitingFor = step.obiect
      }
      await this.waitFor(step.obiect, gen)
      ring?.stop()
      this.ringing = null
      this.waitingFor = null
      if (hint) this.removeHint(hint)
    }

    if (step.actiuni?.length) await this.runScene(step.actiuni, gen)
    gameState.pasiFinalizati.add(step.id)

    if (step.pauza_dupa) {
      this.scene = true
      await this.wait(step.pauza_dupa, gen)
      this.scene = false
    }
  }

  private async runScene(actions: Actiune[], gen: number): Promise<void> {
    this.scene = true
    this.deps.overlay.hint.hide()
    try {
      await this.runActions(actions, gen)
    } finally {
      if (gen === this.generation) this.scene = false
    }
  }

  private async useCalendar(day: ZiData, gen: number): Promise<void> {
    if (!this.requirementsMet()) {
      this.deps.overlay.text.show(day.calendar.refuz.text, day.calendar.refuz.secunde)
      return
    }
    this.hints = []
    this.deps.overlay.hint.hide()
    this.scene = true
    await this.runActions(day.calendar.actiuni, gen)
  }

  private requirementsMet(): boolean {
    const need = this.day?.calendar.necesita
    if (!need) return false
    return (
      need.pasi.every((id) => gameState.pasiFinalizati.has(id)) &&
      need.flaguri.every((flag) => gameState.flaguri.has(flag))
    )
  }

  private glows(id: ObiectId): boolean {
    const key = KEYS[id]
    if (!this.isActive(key)) return false
    return id !== 'calendar' || this.requirementsMet()
  }

  // ---------- Actions

  private async runActions(actions: Actiune[], gen: number): Promise<void> {
    for (const action of actions) {
      this.assertAlive(gen)
      await this.act(action, gen)
    }
  }

  private async act(a: Actiune, gen: number): Promise<void> {
    const { audio, overlay, fx } = this.deps
    switch (a.tip) {
      case 'asteapta':
        return this.wait(a.secunde, gen)
      case 'voce':
        return this.voice(a, gen)
      case 'sunet': {
        const sound = audio.play(a.src, { at: a.la ? this.nodes.get(a.la) : null, volume: a.volum ?? 1 })
        if (!a.asteapta) return
        const buffer = await this.check(sound.ready, gen)
        if (buffer) await this.endedOrTimeout(sound, buffer.duration, gen)
        return
      }
      case 'curent':
        fx.setPower(a.pornit)
        this.applyAmbient()
        if (a.sunet) audio.play(a.sunet)
        return
      case 'lumina':
        fx.setLighting(a.lumina)
        return
      case 'fereastra':
        void fx.setWindowView(a.src)
        return
      case 'privire_fereastra':
        return this.windowLook(a, gen)
      case 'flag':
        gameState.flaguri.add(a.nume)
        return
      case 'text':
        overlay.text.show(a.text, a.secunde)
        return this.wait(a.secunde, gen)
      case 'indiciu':
        this.addHint({ text: a.text })
        return
      case 'titlu':
        overlay.title.show(a.text, a.secunde)
        await this.wait(a.secunde, gen)
        overlay.title.hide()
        return
      case 'fade':
        return this.check(overlay.fade(a.spre, a.secunde), gen)
      case 'zi_urmatoare':
        return this.nextDay(a.lipsa_text, a.secunde, gen)
      case 'ecran_tv':
        return this.tvView(a, gen)
      default: {
        const action = a as unknown as Record<string, unknown>
        const handler = extensionActions.get(String(action.tip))
        if (handler) return handler(action, this.context(gen))
        if (this.extra.handles(a)) return this.check(this.extra.run(a), gen)
        if (this.day18.handles(a)) return this.check(this.day18.run(a), gen)
        // An action type this build does not know yet (e.g. from a newer day file).
        console.warn('[day] Unknown action, skipped:', a)
      }
    }
  }

  private async voice(a: Extract<Actiune, { tip: 'voce' }>, gen: number): Promise<void> {
    const { audio, overlay } = this.deps
    const at = a.la ? this.nodes.get(a.la) : null
    const sound = audio.play(a.src, {
      at,
      filter: a.filtru,
      volume: a.volum ?? (at ? POSITIONAL_VOICE_VOLUME : 1),
    })
    const buffer = await this.check(sound.ready, gen)
    const seconds = buffer ? buffer.duration : MISSING_VOICE_SECONDS
    if (a.subtitrare) {
      overlay.hint.hide()
      overlay.subtitle.show(a.subtitrare, seconds + 0.3)
    }
    if (buffer) await this.endedOrTimeout(sound, buffer.duration, gen)
    else await this.wait(MISSING_VOICE_SECONDS, gen)
    overlay.subtitle.hide()
  }

  /** The player looks through the real window: the frames play on the view behind the glass. */
  private async windowLook(a: Extract<Actiune, { tip: 'privire_fereastra' }>, gen: number): Promise<void> {
    const { audio, fx } = this.deps
    fx.preloadWindow(a.cadre.map((c) => c.imagine))
    const sound = a.sunet
      ? audio.play(a.sunet.src, { at: this.nodes.get('fereastra'), loop: true, volume: a.sunet.volum ?? 1 })
      : null
    try {
      for (const frame of a.cadre) {
        await this.check(fx.setWindowView(frame.imagine, { video: frame.video, bright: true }), gen)
        await this.wait(frame.secunde, gen)
      }
    } finally {
      sound?.stop()
    }
    await this.runActions(a.la_iesire ?? [], gen)
    fx.setWindowBright(false)
  }

  /**
   * The player is moved close to the real TV, static plays on its screen, and
   * gazing at the back button returns them to where they were.
   */
  private async tvView(a: Extract<Actiune, { tip: 'ecran_tv' }>, gen: number): Promise<void> {
    const { overlay, fx } = this.deps
    const point = fx.getTvViewpoint()
    if (!point) {
      console.warn('[tv] No TV in the model; skipping.')
      return
    }
    const from = this.deps.currentPosition()
    await this.check(overlay.fade(1, FADE_MOVE), gen)
    this.deps.moveToPoint({ x: point.x, y: point.y, z: point.z })
    fx.showTv(true, a.inapoi, a.video)
    overlay.snap()
    try {
      await this.check(overlay.fade(0, FADE_MOVE), gen)
      let dwell = 0
      while (dwell < BACK_DWELL) {
        await this.wait(0.1, gen)
        dwell = fx.isTvButtonLookedAt(this.deps.camera) ? dwell + 0.1 : 0
        fx.setTvProgress(dwell / BACK_DWELL)
      }
      await this.check(overlay.fade(1, FADE_MOVE), gen)
    } finally {
      fx.showTv(false)
    }
    this.deps.moveTo(from)
    overlay.snap()
    await this.check(overlay.fade(0, FADE_MOVE), gen)
  }

  private async nextDay(missingText: string, seconds: number, gen: number): Promise<void> {
    const { overlay } = this.deps
    const current = this.day?.zi ?? 15
    let zi = current + 1
    let next = null
    while (zi <= 22) {
      next = await this.check(loadDay(zi), gen)
      if (next) break
      zi += 1
    }
    if (next) {
      // Skip days whose file does not exist yet, so the available days still flow.
      if (zi !== current + 1) {
        console.warn(`[day] Day ${current + 1} is missing; continuing with day ${zi}.`)
      }
      void this.start(zi)
      return
    }
    await this.check(overlay.fade(1, 0.3), gen)
    overlay.title.show(missingText, seconds)
    await this.wait(seconds, gen)
    // The app leaves the game and calls stop(); the screen stays black until then.
    this.deps.onFinished()
  }

  private context(gen: number): ActionContext {
    return {
      deps: this.deps,
      wait: (seconds) => this.wait(seconds, gen),
      check: (promise) => this.check(promise, gen),
      run: (actions) => this.runActions(actions as Actiune[], gen),
      node: (id) => this.nodes.get(id as ObiectId) ?? null,
      setControl: (control) => {
        if (gen === this.generation) this.control = control
      },
      onFrame: (callback) => {
        if (gen === this.generation) this.frameCallbacks.add(callback)
        return () => this.frameCallbacks.delete(callback)
      },
      onCleanup: (callback) => {
        if (gen === this.generation) this.cleanups.push(callback)
        else callback()
      },
      isLocked: () => this.scene || this.ringing !== null || this.control !== null,
    }
  }

  // ---------- Hints

  private addHint(spec: Indiciu): Hint {
    const flag = spec.pana_la_flag
    const hint: Hint = {
      text: spec.text,
      next: now() + (spec.dupa ?? 0),
      repeat: spec.repeta ?? null,
      until: flag ? () => gameState.flaguri.has(flag) : undefined,
    }
    this.hints.push(hint)
    return hint
  }

  private removeHint(hint: Hint): void {
    this.hints = this.hints.filter((h) => h !== hint)
    if (this.shownHint === hint) this.deps.overlay.hint.hide()
  }

  private shownHint: Hint | null = null

  private updateHints(): void {
    const { overlay } = this.deps
    for (const hint of [...this.hints]) {
      if (hint.until?.()) this.removeHint(hint)
    }
    if (this.scene) return
    if (overlay.subtitle.visible || overlay.text.visible || overlay.hint.visible) return
    const t = now()
    for (const hint of this.hints) {
      if (t < hint.next) continue
      overlay.hint.show(hint.text, HINT_SECONDS)
      this.shownHint = hint
      if (hint.repeat) hint.next = t + hint.repeat
      else this.hints = this.hints.filter((h) => h !== hint)
      return
    }
  }

  // ---------- Helpers

  private applyAmbient(): void {
    const power = this.deps.fx.hasPower()
    for (const entry of this.ambient) {
      const needsPower = entry.spec.curent ?? false
      const shouldPlay = power || !needsPower
      if (shouldPlay && !entry.playback) {
        entry.playback = this.deps.audio.play(entry.spec.src, {
          at: entry.spec.la ? this.nodes.get(entry.spec.la) : null,
          loop: true,
          volume: entry.spec.volum ?? 1,
        })
      } else if (!shouldPlay && entry.playback) {
        entry.playback.stop()
        entry.playback = null
      }
    }
  }

  private resolveNodes(): void {
    this.nodes.clear()
    for (const [id, key] of Object.entries(KEYS) as [ObiectId, string][]) {
      const name = STATES.objects[key]
      if (!name) continue
      const node =
        this.deps.room.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ??
        this.deps.room.getObjectByName(name)
      if (node) this.nodes.set(id, node)
      else console.warn(`[day] Object "${id}" (${name}) not found in the model.`)
    }
  }

  private reachable(id: ObiectId): boolean {
    const prompts = getState(this.deps.currentPosition()).interactables
    return Boolean(prompts && KEYS[id] in prompts)
  }

  private spawnId(day: ZiData): StateId {
    if (day.pozitie in STATES.states) return day.pozitie as StateId
    console.warn(`[day] Unknown start position "${day.pozitie}"; using the default spawn.`)
    return STATES.spawn
  }

  /** Ends with the sound, or after its length if audio is blocked, so the day never hangs. */
  private endedOrTimeout(sound: Playback, seconds: number, gen: number): Promise<void> {
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, (seconds + 1.5) * 1000))
    return this.check(Promise.race([sound.ended, timeout]), gen)
  }

  private waitFor(obiect: ObiectId, gen: number): Promise<void> {
    return this.check(
      new Promise<void>((resolve) => {
        this.waiter = { obiect, resolve }
      }),
      gen,
    )
  }

  private wait(seconds: number, gen: number): Promise<void> {
    return this.check(new Promise<void>((resolve) => window.setTimeout(resolve, seconds * 1000)), gen)
  }

  /** Awaits `promise`, then throws if the day was stopped meanwhile. */
  private async check<T>(promise: Promise<T>, gen: number): Promise<T> {
    const value = await promise
    this.assertAlive(gen)
    return value
  }

  private assertAlive(gen: number): void {
    if (gen !== this.generation) throw new Cancelled()
  }

  private async guard(task: Promise<void>): Promise<void> {
    try {
      await task
    } catch (error) {
      if (!(error instanceof Cancelled)) console.error('[day] Unexpected error', error)
    }
  }
}
