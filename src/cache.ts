export type LoadProgress = {
  loaded: number
  total: number
}

export type CacheOptions = {
  cacheName: string
  signal?: AbortSignal
  contentType?: string
  onProgress?: (progress: LoadProgress) => void
}

async function openCache(cacheName: string): Promise<Cache | null> {
  if (!('caches' in window)) return null
  try {
    return await caches.open(cacheName)
  } catch {
    return null
  }
}

async function readResponse(
  response: Response,
  declared: number,
  onProgress?: (progress: LoadProgress) => void,
): Promise<Blob> {
  if (!response.body) {
    const blob = await response.blob()
    onProgress?.({ loaded: blob.size, total: blob.size })
    return blob
  }

  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.({ loaded, total: declared || loaded })
  }

  return new Blob(chunks)
}

async function loadBlob(url: string, options: CacheOptions): Promise<Blob> {
  const cache = await openCache(options.cacheName)
  const key = new Request(url)

  if (cache) {
    const cached = await cache.match(key)
    if (cached) {
      const blob = await cached.blob()
      options.onProgress?.({ loaded: blob.size, total: blob.size })
      return blob
    }
  }

  const response = await fetch(url, { signal: options.signal, cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status} ${response.statusText}`)
  }
  const received = response.headers.get('content-type') ?? ''
  if (options.contentType && options.contentType !== 'text/html' && received.includes('text/html')) {
    throw new Error(`"${url}" is missing: the server returned HTML instead of ${options.contentType}`)
  }

  const declared = Number(response.headers.get('content-length') ?? 0)
  const blob = await readResponse(response, declared, options.onProgress)

  if (cache) {
    try {
      const headers = options.contentType ? { 'Content-Type': options.contentType } : undefined
      await cache.put(key, new Response(blob, { headers }))
    } catch {
      // Cache storage can be full or unavailable; the download still succeeds.
    }
  }

  return blob
}

export async function fetchCachedBlob(url: string, options: CacheOptions): Promise<Blob> {
  return loadBlob(url, options)
}

export async function fetchCachedArrayBuffer(
  url: string,
  options: CacheOptions,
): Promise<ArrayBuffer> {
  const blob = await loadBlob(url, options)
  return blob.arrayBuffer()
}

export async function dropCached(cacheName: string, url: string): Promise<void> {
  const cache = await openCache(cacheName)
  await cache?.delete(new Request(url)).catch(() => undefined)
}

export async function dropOldModelCaches(current: string): Promise<void> {
  if (!('caches' in window)) return
  try {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith('apartment-model-') && name !== current)
        .map((name) => caches.delete(name)),
    )
  } catch {
    // Cache Storage can be unavailable; the current model still loads.
  }
}

export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage) return
  try {
    const persisted = await navigator.storage.persist()
    console.info(`Model cache persistence: ${persisted ? 'granted' : 'best effort'}`)
    const estimate = await navigator.storage.estimate()
    if (estimate.usage != null && estimate.quota != null) {
      const usage = (estimate.usage / 1048576).toFixed(1)
      const quota = (estimate.quota / 1048576).toFixed(1)
      console.info(`Storage: ${usage} MB used of ${quota} MB`)
    }
  } catch {
    // Storage Manager is optional; caching still works on a best-effort basis.
  }
}
