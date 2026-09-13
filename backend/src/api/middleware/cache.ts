import { ElysiaCustomStatusResponse } from 'elysia'

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

type CacheEntry = {
  headers: Record<string, string>
  status: number
  expiresAt: number
} & (
  | { kind: 'value'; body: unknown }
  /** The handler returned a real Response and we buffered its bytes. */
  | { kind: 'response'; body: ArrayBuffer }
)

interface CacheStore {
  name: string
  ttlMs: number
  maxEntries: number
  map: Map<string, CacheEntry>
  hits: number
  misses: number
}

export interface CacheOptions<TQuery = any, TParams = any> {
  ttlMs?: number
  /** Hard cap per route store. Oldest-inserted entries are dropped first. Default 500. */
  maxEntries?: number
  /** Label shown by cacheStats() / used by clearCache(name). Defaults to the first key seen. */
  name?: string
  /** Methods eligible for caching. Default ['GET', 'HEAD']. */
  methods?: readonly string[]
  /** Responses larger than this are passed through uncached. Default 1 MiB. */
  maxBodyBytes?: number
  /**
   * Lambda function to generate a strict, normalized key from validated inputs.
   * Defaults to `METHOD path?sorted&query`.
   */
  getKey?: (ctx: { query: TQuery; params: TParams; path: string; method: string }) => string
  /** Return true to skip the cache entirely for this request (read and write). */
  bypass?: (ctx: any) => boolean
}

/* ------------------------------------------------------------------ *
 * Registry + sweeper
 * ------------------------------------------------------------------ */

const stores = new Set<CacheStore>()

/** Never replayed from cache — either connection-scoped or per-request. */
const UNSAFE_HEADERS = new Set([
  'set-cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'x-cache',
])

let sweepTimer: ReturnType<typeof setInterval> | null = null

/** Drop every entry whose TTL has elapsed. Returns how many were removed. */
export const sweepCaches = (now = Date.now()): number => {
  let removed = 0
  for (const store of stores) {
    for (const [key, entry] of store.map) {
      if (now >= entry.expiresAt) {
        store.map.delete(key)
        removed++
      }
    }
  }
  return removed
}

/** Wipe everything, or just one named store. */
export const clearCaches = (name?: string): void => {
  for (const store of stores) if (name === undefined || store.name === name) store.map.clear()
}

export const cacheStats = () =>
  [...stores].map(({ name, ttlMs, map, hits, misses }) => ({
    name,
    ttlMs,
    size: map.size,
    hits,
    misses,
  }))

export const stopCache = (): void => {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}

/**
 * Start the background sweeper. Call once at boot:
 *
 *   initCache({ sweepIntervalMs: 60_000 })
 *
 * Entries also expire lazily on read, so this is purely about reclaiming memory
 * for keys that are never requested again.
 */
export const initCache = (opts: { sweepIntervalMs?: number } = {}) => {
  stopCache()
  sweepTimer = setInterval(() => sweepCaches(), opts.sweepIntervalMs ?? 60_000)
  // Don't hold the process open just for the sweeper.
  ;(sweepTimer as any).unref?.()
  return { stop: stopCache, sweep: sweepCaches, clear: clearCaches, stats: cacheStats }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const defaultKey = ({ path, query, method }: any): string => {
  if (!query || typeof query !== 'object') return `${method} ${path}`
  const parts = Object.keys(query)
    .sort()
    .map((k) => `${k}=${String(query[k])}`)
  return parts.length ? `${method} ${path}?${parts.join('&')}` : `${method} ${path}`
}

const pickHeaders = (src: Record<string, unknown> | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!src) return out
  for (const [k, v] of Object.entries(src)) {
    if (v == null || UNSAFE_HEADERS.has(k.toLowerCase())) continue
    out[k] = String(v)
  }
  return out
}

const pickResponseHeaders = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => {
    if (!UNSAFE_HEADERS.has(k.toLowerCase())) out[k] = v
  })
  return out
}

const normalizeStatus = (status: unknown): number => {
  if (status === undefined || status === 'OK') return 200
  return typeof status === 'number' ? status : Number.NaN
}

/* ------------------------------------------------------------------ *
 * Hook factory
 * ------------------------------------------------------------------ */

/**
 * Route response cache.
 *
 * SPREAD it into a route's hook options (`...withCache({ ttlMs })`). It must not be
 * passed as `use: [withCache(...)]` — Elysia 1.4 silently ignores beforeHandle /
 * afterHandle hooks supplied that way, so the cache never runs.
 *
 * Each call gets its own store, so two routes can't collide on a short custom key.
 */
export const withCache = <TQuery = any, TParams = any>(options: CacheOptions<TQuery, TParams> = {}) => {
  const store: CacheStore = {
    name: options.name ?? `cache#${stores.size + 1}`,
    ttlMs: options.ttlMs ?? 60_000,
    maxEntries: options.maxEntries ?? 500,
    map: new Map(),
    hits: 0,
    misses: 0,
  }
  stores.add(store)

  const getKey = options.getKey ?? defaultKey
  const methods = new Set((options.methods ?? ['GET', 'HEAD']).map((m) => m.toUpperCase()))
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024

  const keyOf = (ctx: any): string =>
    getKey({
      query: ctx.query as TQuery,
      params: ctx.params as TParams,
      path: ctx.path,
      method: ctx.request?.method ?? 'GET',
    })

  const eligible = (ctx: any): boolean =>
    methods.has(ctx.request?.method ?? 'GET') && !(options.bypass?.(ctx) ?? false)

  const write = (key: string, entry: CacheEntry): void => {
    // Bounded store: Map keeps insertion order, so the first key is the oldest write.
    while (store.map.size >= store.maxEntries) {
      const oldest = store.map.keys().next()
      if (oldest.done) break
      store.map.delete(oldest.value)
    }
    store.map.set(key, entry)
  }

  return {
    beforeHandle(ctx: any): void {
      if (!eligible(ctx)) return

      const key = keyOf(ctx)
      const cached = store.map.get(key)

      if (!cached) {
        store.misses++
        ctx.set.headers['x-cache'] = 'MISS'
        return
      }

      if (Date.now() >= cached.expiresAt) {
        // Evict on read — the old version left these to accumulate forever.
        store.map.delete(key)
        store.misses++
        ctx.set.headers['x-cache'] = 'MISS'
        return
      }

      store.hits++

      if (cached.kind === 'response') {
        // A Response body is a one-shot stream, so the stored bytes are rehydrated
        // into a fresh Response on every hit.
        return new Response(cached.body, {
          status: cached.status,
          headers: { ...cached.headers, 'x-cache': 'HIT' },
        }) as unknown as void
      }

      // Replay the meta the handler set, otherwise the client gets a bare 200 with
      // whatever content-type Elysia infers and none of the handler's own headers.
      ctx.set.status = cached.status
      Object.assign(ctx.set.headers, cached.headers)
      ctx.set.headers['x-cache'] = 'HIT'

      // Returned as `void` on purpose: a real return type here would widen every
      // cached route's inferred response, which Eden Treaty reads. At runtime this
      // short-circuits with exactly what the handler would have produced.
      return cached.body as void
    },

    async afterHandle(ctx: any): Promise<void> {
      if (!eligible(ctx)) return

      // Which field holds the handler's return value depends on the Elysia version;
      // reading both keeps this working either way.
      const value = ctx.responseValue !== undefined ? ctx.responseValue : ctx.response
      if (value === undefined || value === null) return

      // Never cache an error: a 404 stored here would be replayed as a 200.
      if (value instanceof ElysiaCustomStatusResponse) return
      if (value instanceof Error) return

      const expiresAt = Date.now() + store.ttlMs

      if (value instanceof Response) {
        if (value.status !== 200 || value.bodyUsed) return

        const declared = Number(value.headers.get('content-length') ?? Number.NaN)
        if (Number.isFinite(declared) && declared > maxBodyBytes) return

        try {
          const buffer = await value.clone().arrayBuffer()
          if (buffer.byteLength > maxBodyBytes) return
          write(keyOf(ctx), {
            kind: 'response',
            body: buffer,
            headers: pickResponseHeaders(value.headers),
            status: value.status,
            expiresAt,
          })
        } catch {
          // Unclonable / already-consumed stream — just don't cache it.
        }
        return
      }

      if (normalizeStatus(ctx.set.status) !== 200) return

      write(keyOf(ctx), {
        kind: 'value',
        body: value,
        headers: pickHeaders(ctx.set.headers),
        status: 200,
        expiresAt,
      })
    },
  }
}