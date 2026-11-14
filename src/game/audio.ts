import * as THREE from 'three'
import { assetUrl } from './days'

// All game sound goes through one THREE.AudioListener on the camera, so
// positional sources (radio, phone, window) pan with the head in VR.

export type PlayOptions = {
  /** Plays from this object (positional). Omitted = inside the player's head (Radu). */
  at?: THREE.Object3D | null
  volume?: number
  loop?: boolean
  filter?: 'radio' | 'telefon'
}

export type Playback = {
  /** The decoded buffer, or null when the file is missing or broken. */
  ready: Promise<AudioBuffer | null>
  /** Resolves when the sound ends or is stopped (immediately if missing). */
  ended: Promise<void>
  stop: () => void
}

export class GameAudio {
  readonly listener = new THREE.AudioListener()
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>()
  private readonly live = new Set<Playback>()

  constructor(camera: THREE.Camera) {
    camera.add(this.listener)
    // Phones and headsets suspend the context when the immersive session starts
    // (and sometimes swap the audio route). The gesture that opened VR is gone
    // by then, so wake it back up whenever it drops out of "running".
    this.context.addEventListener('statechange', this.handleStateChange)
  }

  get context(): AudioContext {
    return this.listener.context
  }

  private readonly handleStateChange = (): void => {
    console.info('[audio] Context state:', this.context.state)
    this.resume()
  }

  /** Call from a user gesture (tap/click) so phones allow sound. Safe to repeat. */
  resume(): void {
    if (this.context.state === 'running') return
    void this.context.resume().catch(() => undefined)
  }

  dispose(): void {
    this.context.removeEventListener('statechange', this.handleStateChange)
    this.stopAll()
  }

  load(src: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(src)
    if (!pending) {
      pending = fetch(assetUrl(src))
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.arrayBuffer()
        })
        .then((data) => this.context.decodeAudioData(data))
        .catch((error: unknown) => {
          console.warn(`[audio] Missing or unreadable file "${src}"; continuing without it.`, error)
          return null
        })
      this.buffers.set(src, pending)
    }
    return pending
  }

  play(src: string, options: PlayOptions = {}): Playback {
    return this.start(this.load(src), options)
  }

  /** Stops every sound that is still playing (leaving the game). */
  stopAll(): void {
    for (const playback of [...this.live]) playback.stop()
  }

  private filters(kind: PlayOptions['filter']): BiquadFilterNode[] {
    if (!kind) return []
    const [low, high] = kind === 'radio' ? [300, 3500] : [400, 3000]
    const highpass = this.context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = low
    highpass.Q.value = kind === 'telefon' ? 1.2 : 0.7
    const lowpass = this.context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = high
    lowpass.Q.value = kind === 'telefon' ? 1.2 : 0.7
    const filters = [highpass, lowpass]
    if (kind === 'telefon') {
      const presence = this.context.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 1800
      presence.gain.value = 6
      filters.push(presence)
    }
    return filters
  }

  private start(bufferPromise: Promise<AudioBuffer | null>, options: PlayOptions): Playback {
    let sound: THREE.Audio<GainNode | PannerNode> | null = null
    let stopped = false
    let finish: () => void = () => undefined
    const ended = new Promise<void>((resolve) => {
      finish = resolve
    })

    const playback: Playback = {
      ready: bufferPromise,
      ended,
      stop: () => {
        stopped = true
        if (sound?.isPlaying) sound.stop()
        cleanup()
      },
    }

    let done = false
    const cleanup = (): void => {
      if (done) return
      done = true
      this.live.delete(playback)
      if (sound) {
        sound.parent?.remove(sound)
        sound.disconnect()
      }
      finish()
    }

    this.live.add(playback)
    void bufferPromise.then((buffer) => {
      if (!buffer || stopped) {
        cleanup()
        return
      }
      if (options.at) {
        const positional = new THREE.PositionalAudio(this.listener)
        positional.setRefDistance(1.2)
        positional.setRolloffFactor(1.4)
        options.at.add(positional)
        sound = positional
      } else {
        sound = new THREE.Audio(this.listener)
      }
      sound.setBuffer(buffer)
      sound.setLoop(options.loop ?? false)
      sound.setVolume(options.volume ?? 1)
      const filters = this.filters(options.filter)
      if (filters.length > 0) sound.setFilters(filters)
      this.resume()
      sound.play()
      // Natural end (stop() also cleans up itself).
      sound.source?.addEventListener('ended', cleanup)
    })

    return playback
  }
}
