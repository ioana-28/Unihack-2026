import type { ZiData } from './types'

// Day files are bundled from data/zNN.json, so adding data/z16.json is enough
// for the runner to continue into day 16.
const files = import.meta.glob<ZiData>('/data/z*.json', { import: 'default' })

/** Loads every day file up front (bundled chunks), so no request is needed later. */
export async function loadAllDays(): Promise<ZiData[]> {
  const days = await Promise.all(
    Object.values(files).map((load) => load().catch(() => null)),
  )
  return days.filter((day): day is ZiData => day !== null)
}

export async function loadDay(zi: number): Promise<ZiData | null> {
  const load = files[`/data/z${zi}.json`]
  if (!load) return null
  try {
    return await load()
  } catch (error) {
    console.warn(`Day file data/z${zi}.json could not be loaded.`, error)
    return null
  }
}

/** URL for an asset path from a day file (paths are relative to public/). */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}
