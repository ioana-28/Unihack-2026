import { fetchCachedBlob, type LoadProgress } from './cache'
import { assetUrl, loadAllDays } from './game/days'

export const MEDIA_CACHE = 'apartment-media-2026-11-16-v2'

const PROLOGUE_VERSION = '2026-11-14'
export const PROLOGUE_VIDEO_URL =
  new URLSearchParams(window.location.search).get('video') ??
  `/media/video_intro.mp4?v=${PROLOGUE_VERSION}`
export const PROLOGUE_POSTER_URL = '/media/prologue-poster.jpg'

const FIXED_ASSETS = [
  PROLOGUE_VIDEO_URL,
  PROLOGUE_POSTER_URL,
  '/media/newspaper_page1.jpeg',
  '/media/newspaper_page2.jpeg',
  // Referenced directly by the day 16 extension, not by the day files.
  'media/audio/ambient/multime_z20.mp3',
  'media/audio/ambient/scandari_z16.mp3',
]
const CONCURRENCY = 4
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 800

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  glb: 'model/gltf-binary',
}

const objectUrls = new Map<string, string>()
let progress: LoadProgress = { loaded: 0, total: 0 }
let ready = false
let started = false

function normalize(path: string): string {
  return path.replace(/^\/+/, '')
}

export function contentTypeFor(path: string): string {
  const clean = path.split('?')[0].toLowerCase()
  const extension = clean.slice(clean.lastIndexOf('.') + 1)
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/** Blob URL for a preloaded asset, or the network URL if it failed to preload. */
export function mediaSrc(path: string): string {
  return objectUrls.get(normalize(path)) ?? assetUrl(normalize(path))
}

export function getMediaProgress(): LoadProgress {
  return progress
}

export function isMediaReady(): boolean {
  return ready
}

function collectPaths(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('media/')) into.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, into)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPaths(item, into)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function loadOne(path: string): Promise<void> {
  const key = normalize(path)
  const url = /^https?:/.test(path) ? path : assetUrl(key)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const blob = await fetchCachedBlob(url, {
        cacheName: MEDIA_CACHE,
        contentType: contentTypeFor(path),
      })
      objectUrls.set(key, URL.createObjectURL(blob))
      return
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`[media] Could not preload "${path}"; it will load on demand.`, error)
        return
      }
      await delay(RETRY_DELAY_MS * attempt)
    }
  }
}

/** Downloads every asset the days reference into Cache Storage and Blob URLs. */
export async function startMediaPreload(): Promise<void> {
  if (started) return
  started = true

  if ('caches' in window) {
    void caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('apartment-media-') && name !== MEDIA_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .catch(() => undefined)
  }

  const paths = new Set(FIXED_ASSETS)
  for (const day of await loadAllDays()) collectPaths(day, paths)
  const queue = [...paths]
  progress = { loaded: 0, total: queue.length }

  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= queue.length) return
      await loadOne(queue[index])
      progress = { loaded: progress.loaded + 1, total: progress.total }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  ready = true
}
