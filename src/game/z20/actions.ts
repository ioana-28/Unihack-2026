import * as THREE from 'three'
import { registerAction } from '../runner'
import type { ActionContext } from '../runner'

// Day-20 action types: the crowd that grows all day at the window, the crowd
// under Ioana's phone call, and the crowd fading out at the end of the day.

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

// ---------- Crowd for the whole day: quiet at first, louder over N seconds, then steady

type Crowd = { sound: THREE.Audio<AudioNode>; volume: number }
let crowd: Crowd | null = null

function stopCrowd(): void {
  if (!crowd) return
  if (crowd.sound.isPlaying) crowd.sound.stop()
  crowd.sound.removeFromParent()
  crowd = null
}

registerAction('multime_crescatoare', async (a, ctx) => {
  stopCrowd()
  const buffer = await ctx.check(ctx.deps.audio.load(str(a.src)))
  if (!buffer) return
  const at = a.la ? ctx.node(str(a.la)) : null
  const listener = ctx.deps.audio.listener
  const sound: THREE.Audio<AudioNode> = at ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener)
  if (sound instanceof THREE.PositionalAudio) {
    sound.setRefDistance(1.2)
    sound.setRolloffFactor(1.4)
  }
  const start = num(a.volum_start, 0.15)
  const end = num(a.volum_final, 1.6)
  const seconds = num(a.secunde, 60)
  sound.setBuffer(buffer)
  sound.setLoop(true)
  sound.setVolume(start)
  ;(at ?? listener).add(sound)
  sound.play()
  const entry: Crowd = { sound, volume: start }
  crowd = entry
  ctx.onCleanup(stopCrowd)

  // Ramp in the background; the action returns at once so the day goes on.
  const began = performance.now() / 1000
  const stopRamp = ctx.onFrame(() => {
    if (crowd !== entry) return stopRamp()
    const t = Math.min(1, (performance.now() / 1000 - began) / seconds)
    entry.volume = start + (end - start) * t
    sound.setVolume(entry.volume)
    if (t >= 1) stopRamp()
  })
})

// ---------- End of the day: the crowd fades out

registerAction('multime_stinge', async (a, ctx) => {
  if (!crowd) return
  const entry = crowd
  const from = entry.volume
  const seconds = num(a.secunde, 2)
  const began = performance.now() / 1000
  for (;;) {
    const t = Math.min(1, (performance.now() / 1000 - began) / seconds)
    entry.sound.setVolume(from * (1 - t))
    if (t >= 1) break
    await ctx.wait(0.05)
  }
  stopCrowd()
})

// ---------- A voice with a sound bed under it (crowd behind Ioana on the phone)

registerAction('voce_cu_fundal', async (a, ctx: ActionContext) => {
  const bedSpec = (a.fundal ?? {}) as { src?: unknown; volum?: unknown }
  const at = a.la ? ctx.node(str(a.la)) : null
  const filter = a.filtru === 'telefon' || a.filtru === 'radio' ? a.filtru : undefined
  const bed = bedSpec.src
    ? ctx.deps.audio.play(str(bedSpec.src), { at, loop: true, filter, volume: num(bedSpec.volum, 0.6) })
    : null
  try {
    await ctx.run([{ tip: 'voce', src: a.src, subtitrare: a.subtitrare ?? null, la: a.la, filtru: a.filtru, volum: a.volum }])
  } finally {
    bed?.stop()
  }
})
