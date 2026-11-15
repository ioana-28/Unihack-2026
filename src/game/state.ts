// Global game state (state machine §1 "Global variables") plus per-day progress.

export type DecizieZ18 = 'minciuna' | 'nume' | null

export type GameState = {
  zi: number
  /** Current step id, e.g. "15.2"; "15.0" while waiting for the first step. */
  pas: string
  pasiFinalizati: Set<string>
  flaguri: Set<string>
  film_ascuns: boolean
  film_confiscat: boolean
  a_dat_numele: boolean
  /** The day 18 choice, kept for the ending. null until the player chooses. */
  decizie_z18: DecizieZ18
}

export const gameState: GameState = {
  zi: 15,
  pas: '15.0',
  pasiFinalizati: new Set(),
  flaguri: new Set(),
  film_ascuns: false,
  film_confiscat: false,
  a_dat_numele: false,
  decizie_z18: null,
}

/** Called at the start of each day: day progress resets, global variables stay. */
export function beginDay(zi: number): void {
  gameState.zi = zi
  gameState.pas = `${zi}.0`
  gameState.pasiFinalizati.clear()
  gameState.flaguri.clear()
}

/** Back to S_START: everything resets. */
export function resetGame(): void {
  beginDay(15)
  gameState.film_ascuns = false
  gameState.film_confiscat = false
  gameState.a_dat_numele = false
  gameState.decizie_z18 = null
}
