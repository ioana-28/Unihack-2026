import * as THREE from 'three'
import { STATES } from '../scene/states'
import type { GameAudio, Playback } from './audio'
import { createChoiceCards } from './choice-cards'
import type { Overlay } from './overlay'
import { createPeephole } from './peephole'
import { createNewspaperCloseup } from './newspaper-closeup'
import type { RoomFx } from './room-fx'
import { gameState } from './state'

// Day 18 extension. It plugs into DayRunner through the runner's default
// action branch, so the existing step/action types keep their old behaviour.
// Every missing asset is non-fatal: the scene logs a warning, shows its
// subtitle for four seconds, or keeps its generated fallback.

const PREFIX = 'ziua18_'
const MISSING_VOICE_SECONDS = 4
const POSITIONAL_VOICE_VOLUME = 1.6
const CLOSEUP_FADE = 0.3
const WINDOW_SECONDS = 15
const STATIC_RADIO_VOLUME = 0.025
const KNOCKS_DELAY_SECONDS = 3
const KNOCKS_INTERVAL_SECONDS = 5
const KNOCK_GAP_SECONDS = 0.7
const NODE_KEYS: Record<string, string> = {
  fereastra: 'window',
  televizor: 'tv',
  frigider: 'fridge',
  radio: 'radio',
  entryDoor: 'entryDoor',
}

type Action = {
  tip: string
  [key: string]: unknown
}

type Waiter = {
  timer: number
  resolve: () => void
}

type FridgeHum = {
  node: THREE.Object3D
  audio: THREE.PositionalAudio
}

export type Day18Deps = {
  audio: GameAudio
  overlay: Overlay
  fx: RoomFx
  camera: THREE.Camera
  room: THREE.Object3D
}

export type Day18Extension = {
  handles: (action: unknown) => boolean
  run: (action: unknown) => Promise<void>
  reset: () => void
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function createDay18Extension(deps: Day18Deps): Day18Extension {
  const { audio, overlay, fx, camera, room } = deps
  const peephole = createPeephole(camera)
  const newspaper = createNewspaperCloseup(camera as THREE.PerspectiveCamera)

  let generation = 0
  let fridgeHum: FridgeHum | null = null
  let noiseBuffer: AudioBuffer | null = null
  let doorCueWatch = 0
  let doorCueStart = 0
  let doorCueRepeat = 0
  let doorCueSecond = 0
  let doorCueStarted = false
  let doorCueFinished = false
  const waiters = new Set<Waiter>()
  const playbacks = new Set<Playback>()
  const nodeStops = new Set<() => void>()

  const alive = (gen: number): boolean => gen === generation

  const wait = (seconds: number): Promise<void> =>
    new Promise((resolve) => {
      const waiter: Waiter = {
        timer: 0,
        resolve: () => {
          window.clearTimeout(waiter.timer)
          waiters.delete(waiter)
          resolve()
        },
      }
      waiter.timer = window.setTimeout(waiter.resolve, Math.max(0, seconds) * 1000)
      waiters.add(waiter)
    })

  const flushWaiters = (): void => {
    for (const waiter of [...waiters]) waiter.resolve()
  }

  const play = (src: string, options: Parameters<GameAudio['play']>[1] = {}): Playback => {
    const playback = audio.play(src, options)
    playbacks.add(playback)
    void playback.ended.finally(() => playbacks.delete(playback))
    return playback
  }

  const stopPlaybacks = (): void => {
    for (const playback of [...playbacks]) playback.stop()
    playbacks.clear()
  }

  const stopNodes = (): void => {
    for (const stop of [...nodeStops]) stop()
    nodeStops.clear()
  }

  const nodeFor = (key: string): THREE.Object3D | null => {
    const stateKey = NODE_KEYS[key] ?? key
    const name = STATES.objects[stateKey]
    if (!name) return null
    return (
      room.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ??
      room.getObjectByName(name) ??
      null
    )
  }

  const playLine = async (
    src: string,
    subtitle: string,
    at: THREE.Object3D | null,
    filter: 'radio' | 'telefon' | undefined,
    gen: number,
  ): Promise<void> => {
    const sound = play(src, {
      at,
      filter,
      volume: at ? POSITIONAL_VOICE_VOLUME : 1,
    })
    const buffer = await sound.ready
    if (!alive(gen)) {
      sound.stop()
      return
    }
    const seconds = buffer ? buffer.duration : MISSING_VOICE_SECONDS
    overlay.hint.hide()
    overlay.subtitle.show(subtitle, seconds + 0.3)
    if (buffer) await Promise.race([sound.ended, wait(seconds + 1.5)])
    else await wait(MISSING_VOICE_SECONDS)
    if (alive(gen)) overlay.subtitle.hide()
    sound.stop()
  }

  const playSpeakerLine = (
    src: string,
    text: string,
    at: THREE.Object3D | null,
    filter: 'radio' | 'telefon' | undefined,
    gen: number,
  ): Promise<void> => playLine(src, `Agentul de Securitate: ${text}`, at, filter, gen)

  const makeNoise = (): AudioBuffer => {
    if (noiseBuffer) return noiseBuffer
    const ctx = audio.context
    const length = Math.floor(ctx.sampleRate * 2)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
    noiseBuffer = buffer
    return buffer
  }

  const startRadioStatic = (): (() => void) => {
    const ctx = audio.context
    const source = ctx.createBufferSource()
    source.buffer = makeNoise()
    source.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 0.55
    const gain = ctx.createGain()
    gain.gain.value = STATIC_RADIO_VOLUME
    source.connect(band)
    band.connect(gain)
    gain.connect(audio.listener.getInput())
    audio.resume()
    source.start()
    let stopped = false
    const stop = (): void => {
      if (stopped) return
      stopped = true
      nodeStops.delete(stop)
      try {
        source.stop()
      } catch {
        // already stopped
      }
      source.disconnect()
      band.disconnect()
      gain.disconnect()
    }
    nodeStops.add(stop)
    return stop
  }

  const startFridgeHum = (): void => {
    if (fridgeHum) return
    const fridge = nodeFor('frigider')
    if (!fridge) {
      console.warn('[day18] Fridge not found; steady kitchen hum will be skipped.')
      return
    }
    const ctx = audio.context
    const rate = ctx.sampleRate
    const length = Math.floor(rate * 2)
    const buffer = ctx.createBuffer(1, length, rate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      const t = i / rate
      data[i] =
        0.1 * Math.sin(Math.PI * 2 * 50 * t) +
        0.035 * Math.sin(Math.PI * 2 * 100 * t) +
        0.008 * (Math.random() * 2 - 1)
    }
    const hum = new THREE.PositionalAudio(audio.listener)
    hum.setBuffer(buffer)
    hum.setLoop(true)
    hum.setVolume(0.45)
    hum.setRefDistance(1.2)
    hum.setRolloffFactor(1.6)
    fridge.add(hum)
    audio.resume()
    hum.play()
    fridgeHum = { node: fridge, audio: hum }
  }

  const stopFridgeHum = (): void => {
    if (!fridgeHum) return
    if (fridgeHum.audio.isPlaying) fridgeHum.audio.stop()
    fridgeHum.audio.parent?.remove(fridgeHum.audio)
    fridgeHum.audio.disconnect()
    fridgeHum = null
  }

  // The runner loops the doorbell and waits for `entryDoor`; these knocks ride
  // on top of that ring while the player walks through the hallway states.
  const playKnocks = (): void => {
    if (doorCueFinished) return
    const doorNode = nodeFor('entryDoor')
    play('media/audio/sfx/usa_bataie.mp3', { at: doorNode, volume: 0.9 })
    doorCueSecond = window.setTimeout(() => {
      if (doorCueFinished) return
      play('media/audio/sfx/usa_bataie.mp3', { at: doorNode, volume: 0.9 })
    }, KNOCK_GAP_SECONDS * 1000)
  }

  const startDoorCue = (): void => {
    if (doorCueStarted || doorCueFinished) return
    doorCueStarted = true
    doorCueStart = window.setTimeout(() => {
      if (!doorCueStarted || doorCueFinished) return
      playKnocks()
      doorCueRepeat = window.setInterval(playKnocks, KNOCKS_INTERVAL_SECONDS * 1000)
    }, KNOCKS_DELAY_SECONDS * 1000)
  }

  const stopDoorCue = (): void => {
    doorCueStarted = false
    doorCueFinished = true
    window.clearTimeout(doorCueStart)
    window.clearInterval(doorCueRepeat)
    window.clearTimeout(doorCueSecond)
    doorCueStart = 0
    doorCueRepeat = 0
    doorCueSecond = 0
  }

  const stopDoorCueWatch = (): void => {
    if (doorCueWatch === 0) return
    window.clearInterval(doorCueWatch)
    doorCueWatch = 0
  }

  const startDoorCueWatch = (): void => {
    stopDoorCueWatch()
    doorCueWatch = window.setInterval(() => {
      if (doorCueFinished || gameState.zi !== 18) return
      if (gameState.pas === '18.2') startDoorCue()
    }, 250)
  }

  const closeViews = (): void => {
    peephole.close()
    newspaper.close()
  }

  const reset = (): void => {
    generation += 1
    stopDoorCueWatch()
    stopDoorCue()
    doorCueFinished = false
    flushWaiters()
    stopPlaybacks()
    stopNodes()
    closeViews()
    stopFridgeHum()
    overlay.subtitle.hide()
  }

  const runWindow = async (action: Action, gen: number): Promise<void> => {
    const image = asString(action.imagine) ?? 'media/img/img_piata_lumanari_18.jpg'
    const windowNode = nodeFor('fereastra')
    fx.preloadWindow([image])
    await fx.setWindowView(image, { bright: true })
    if (!alive(gen)) return
    const started = performance.now()
    const chant = play('media/audio/ambient/scandari_z16.mp3', {
      at: windowNode,
      loop: true,
      volume: 0.1,
    })
    await wait(7)
    chant.stop()
    if (!alive(gen)) return
    const fire = play('media/audio/sfx/rafale.mp3', {
      at: windowNode,
      volume: 0.65,
    })
    await wait(4)
    fire.stop()
    if (!alive(gen)) return
    play('media/audio/sfx/impuscatura_aproape.mp3', {
      at: windowNode,
      volume: 0.78,
    })
    await wait(1)
    const elapsed = (performance.now() - started) / 1000
    if (elapsed < WINDOW_SECONDS) await wait(WINDOW_SECONDS - elapsed)
    if (alive(gen)) fx.setWindowBright(false)
  }

  const runVizor = async (gen: number): Promise<void> => {
    stopDoorCueWatch()
    stopDoorCue()
    stopPlaybacks()
    const doorNode = nodeFor('entryDoor')

    if (!gameState.film_ascuns) gameState.film_confiscat = true
    const video = gameState.film_ascuns
      ? 'media/video/video_agent_gol.mp4'
      : 'media/video/video_agent_film.mp4'
    await overlay.fade(1, CLOSEUP_FADE)
    if (!alive(gen)) return
    peephole.open(video)
    await overlay.fade(0, CLOSEUP_FADE)
    if (!alive(gen)) return

    await playSpeakerLine(
      'media/audio/voce/agent_intro.mp3',
      'Bună ziua, tovarășe Petrescu. Securitatea. Căutăm studenți care au participat la tulburări. Și oameni care fotografiază.',
      doorNode,
      undefined,
      gen,
    )
    if (!alive(gen)) return
    if (gameState.film_ascuns) {
      await playSpeakerLine(
        'media/audio/voce/agent_gol.mp3',
        'Aparatul e gol? Bine. Foarte bine.',
        doorNode,
        undefined,
        gen,
      )
    } else {
      await playSpeakerLine(
        'media/audio/voce/agent_film.mp3',
        'Un Zenit. Frumos aparat. Aveți grijă ce fotografiați.',
        doorNode,
        undefined,
        gen,
      )
    }
    if (!alive(gen)) return
    await playSpeakerLine(
      'media/audio/voce/agent_propunere.mp3',
      'Dacă ne spuneți cine din bloc a fost în piață, nu mai căutăm prin casă.',
      doorNode,
      undefined,
      gen,
    )
  }

  const runChoice = async (gen: number): Promise<void> => {
    let parent = peephole.group
    if (!parent) {
      peephole.open(null)
      parent = peephole.group
    }
    if (!parent) {
      console.warn('[day18] Peephole was not available for the choice cards.')
      return
    }
    const cards = createChoiceCards(parent, camera as THREE.PerspectiveCamera, [
      'N-am văzut pe nimeni.',
      'Nepotul doamnei Ana. Sorin.',
    ])
    let selection: 0 | 1 | null = null
    try {
      cards.show()
      let last = performance.now()
      while (alive(gen) && selection === null) {
        await wait(1 / 30)
        const now = performance.now()
        const delta = Math.min(0.05, (now - last) / 1000)
        last = now
        selection = cards.update(camera, delta)
      }
      if (alive(gen) && selection !== null) {
        gameState.a_dat_numele = selection === 1
        gameState.decizie_z18 = selection === 1 ? 'nume' : 'minciuna'
      }
    } finally {
      cards.hide()
      cards.dispose()
    }
  }

  const runReply = async (gen: number): Promise<void> => {
    const doorNode = nodeFor('entryDoor')
    if (gameState.a_dat_numele) {
      await playSpeakerLine(
        'media/audio/voce/agent_raspuns_nume.mp3',
        'Vedeți? Nu a fost greu. O zi bună.',
        doorNode,
        undefined,
        gen,
      )
    } else {
      await playSpeakerLine(
        'media/audio/voce/agent_raspuns_minciuna.mp3',
        'Însănătoșire grabnică, tovarășe Petrescu. Ne mai vedem.',
        doorNode,
        undefined,
        gen,
      )
    }
    if (!alive(gen)) return
    console.warn('[day18] Missing footsteps on the stairs; closing the peephole after the reply.')
    await wait(2)
    await overlay.fade(1, CLOSEUP_FADE)
    if (!alive(gen)) return
    peephole.close()
    await overlay.fade(0, CLOSEUP_FADE)
  }

  const runNewspaper = async (action: Action, gen: number): Promise<void> => {
    await wait(0.8)
    if (!alive(gen)) return
    const image = asString(action.imagine) ?? 'media/img/ziar_z18.jpg'
    newspaper.open(image)
    try {
      let last = performance.now()
      while (alive(gen) && newspaper.isOpen()) {
        await wait(1 / 30)
        const now = performance.now()
        const delta = Math.min(0.05, (now - last) / 1000)
        last = now
        newspaper.update(delta)
      }
    } finally {
      newspaper.close()
    }
  }

  const runRadio = async (action: Action, gen: number): Promise<void> => {
    const src = asString(action.src) ?? 'media/audio/voce/radio_europa_z18.mp3'
    const subtitle =
      asString(action.subtitrare) ??
      'Agențiile occidentale relatează că forțele de ordine au deschis focul asupra demonstranților din Timișoara. Numărul victimelor nu poate fi confirmat.'
    const radioNode = nodeFor('radio')
    const staticStop = startRadioStatic()
    try {
      await playLine(src, subtitle, radioNode, 'radio', gen)
    } finally {
      staticStop()
    }
  }

  const runFinal = async (gen: number): Promise<void> => {
    const text = gameState.a_dat_numele
      ? 'Am spus un nume. Un singur nume. Măcar n-au întrebat de Ioana.'
      : 'Am mințit un ofițer de Securitate. Mi-a tremurat vocea, dar am mințit.'
    overlay.text.show(text, 5)
    await wait(5)
    if (!alive(gen)) return
    overlay.text.hide()
  }

  const run = async (action: unknown): Promise<void> => {
    if (!action || typeof action !== 'object') return
    const entry = action as Action
    if (!entry.tip.startsWith(PREFIX)) return
    const gen = generation
    switch (entry.tip) {
      case 'ziua18_start':
        startFridgeHum()
        startDoorCueWatch()
        return
      case 'ziua18_fereastra':
        return runWindow(entry, gen)
      case 'ziua18_vizor':
        return runVizor(gen)
      case 'ziua18_choice':
        return runChoice(gen)
      case 'ziua18_reply':
        return runReply(gen)
      case 'ziua18_ziar':
        return runNewspaper(entry, gen)
      case 'ziua18_radio':
        return runRadio(entry, gen)
      case 'ziua18_final':
        return runFinal(gen)
      default:
        console.warn(`[day18] Unknown action "${entry.tip}", skipped.`)
    }
  }

  const handles = (action: unknown): boolean => {
    if (!action || typeof action !== 'object') return false
    const tip = (action as { tip?: unknown }).tip
    return typeof tip === 'string' && tip.startsWith(PREFIX)
  }

  return { handles, run, reset }
}
