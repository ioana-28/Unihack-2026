// Schema of data/zNN.json. Keys are Romanian, matching the docs.
// Asset paths are relative to public/ (e.g. "media/audio/voce/radu_replica2.mp3").

/** Romanian object names used by the day files. */
export type ObiectId =
  | 'radio'
  | 'telefon'
  | 'fereastra'
  | 'usa'
  | 'ziar'
  | 'calendar'
  | 'frigider'
  | 'televizor'

export type Lumina = 'zi' | 'seara' | 'noapte'

export type Indiciu = {
  text: string
  /** Seconds before the first showing. */
  dupa?: number
  /** Seconds between showings; omitted = show once. */
  repeta?: number
  /** Stop repeating once this flag is set (free-time hints). */
  pana_la_flag?: string
}

export type Cadru = { imagine: string; video?: string; secunde: number }

export type SunetSpec = { src: string; volum?: number }

export type Actiune =
  | { tip: 'asteapta'; secunde: number }
  | {
      tip: 'voce'
      src: string
      subtitrare: string | null
      la?: ObiectId
      filtru?: 'radio' | 'telefon'
      volum?: number
    }
  | { tip: 'sunet'; src: string; la?: ObiectId; volum?: number; asteapta?: boolean }
  | { tip: 'curent'; pornit: boolean; sunet?: string }
  | { tip: 'lumina'; lumina: Lumina }
  | { tip: 'fereastra'; src: string }
  | {
      tip: 'privire_fereastra'
      cadre: Cadru[]
      sunet?: SunetSpec
      la_iesire?: Actiune[]
    }
  | { tip: 'flag'; nume: string }
  | { tip: 'text'; text: string; secunde: number }
  | { tip: 'indiciu'; text: string }
  | { tip: 'titlu'; text: string; secunde: number }
  | { tip: 'fade'; spre: 0 | 1; secunde: number }
  | { tip: 'zi_urmatoare'; lipsa_text: string; secunde: number }
  /** Full view of the TV (static, or `video` if it exists) with a gaze button to back out. */
  | { tip: 'ecran_tv'; inapoi: string; video?: string }

export type Pas = {
  id: string
  /** Object the player must gaze at to start this step; omitted = automatic. */
  obiect?: ObiectId
  /** The object rings (loops this sound) until answered; everything else is locked. */
  suna?: SunetSpec
  indiciu?: Indiciu
  /** Objects that become active (optional, repeatable) from this step on. */
  activeaza?: ObiectId[]
  actiuni?: Actiune[]
  /** Seconds to wait (locked) before the next step starts. */
  pauza_dupa?: number
}

export type Ambient = {
  src: string
  la?: ObiectId
  volum?: number
  /** Needs electricity: stops during a power cut. */
  curent?: boolean
}

export type ZiData = {
  zi: number
  data: string
  lumina: Lumina
  pozitie: string
  fereastra: string
  /** Optional objects active from the start of the day. */
  optionale?: ObiectId[]
  ambient?: Ambient[]
  start?: Actiune[]
  pasi: Pas[]
  /** Optional objects: what they do. `curent` = unusable during a power cut. */
  obiecte?: Partial<Record<ObiectId, { actiuni: Actiune[]; curent?: boolean }>>
  calendar: {
    necesita: { pasi: string[]; flaguri: string[] }
    refuz: { text: string; secunde: number }
    actiuni: Actiune[]
  }
}
