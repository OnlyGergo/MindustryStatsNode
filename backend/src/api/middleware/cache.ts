import { ElysiaCustomStatusResponse } from 'elysia'

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

type CacheEntry = {
  key: string
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
  /** Bumped by clearCaches, so a fill that started before a clear never writes after it. */
  generation: number
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
  // Set per caller before the handler runs (rate limiter, CORS); replaying the
  // first caller's values would overwrite every later caller's real ones.
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'vary',
])

const isUnsafeHeader = (name: string): boolean => {
  const lower = name.toLowerCase()
  return UNSAFE_HEADERS.has(lower) || lower.startsWith('access-control-')
}

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
  for (const store of stores) {
    if (name !== undefined && store.name !== name) continue
    store.map.clear()
    store.generation++
  }
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
    if (v == null || isUnsafeHeader(k)) continue
    out[k] = String(v)
  }
  return out
}

const pickResponseHeaders = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => {
    if (!isUnsafeHeader(k)) out[k] = v
  })
  return out
}

const normalizeStatus = (status: unknown): number => {
  if (status === undefined || status === 'OK') return 200
  return typeof status === 'number' ? status : Number.NaN
}

interface Deferred {
  promise: Promise<CacheEntry | null>
  resolve(entry: CacheEntry | null): void
}

const deferred = (): Deferred => {
  let resolve!: (entry: CacheEntry | null) => void
  const promise = new Promise<CacheEntry | null>((r) => { resolve = r })
  return { promise, resolve }
}

/**
 * Per-request cache state, shared by the three hooks of one route. `served` marks
 * a response replayed from the cache; `flight` is set while this request leads a
 * single-flight fill.
 */
interface RequestState {
  key: string
  served: boolean
  /** The store's generation when this request missed. */
  generation?: number
  flight?: Deferred
}

const pending = new WeakMap<Request, RequestState>()

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
    generation: 0,
  }
  stores.add(store)

  const getKey = options.getKey ?? defaultKey
  const methods = new Set((options.methods ?? ['GET', 'HEAD']).map((m) => m.toUpperCase()))
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024

  // Key on the matched route pattern, not the raw URL path: `/api/servers/` and
  // `/api/servers` (Elysia matches both) are one resource, and must not be two entries.
  const keyOf = (ctx: any): string =>
    getKey({
      query: ctx.query as TQuery,
      params: ctx.params as TParams,
      path: (ctx.route as string | undefined) ?? String(ctx.path).replace(/\/+$/, ''),
      method: ctx.request?.method ?? 'GET',
    })

  const eligible = (ctx: any): boolean =>
    methods.has(ctx.request?.method ?? 'GET') && !(options.bypass?.(ctx) ?? false)

  const write = (key: string, entry: CacheEntry): void => {
    store.map.delete(key)
    // Bounded store: Map keeps insertion order, so the first key is the oldest write.
    while (store.map.size >= store.maxEntries) {
      const oldest = store.map.keys().next()
      if (oldest.done) break
      store.map.delete(oldest.value)
    }
    store.map.set(key, entry)
  }

  /**
   * Single-flight: the first request to miss a key registers here and runs the
   * handler; concurrent misses on the same key wait for its result instead of
   * each running the same (often heavy) query. Resolves to null when the
   * response turned out not to be cacheable, and the waiters then run the
   * handler themselves.
   */
  const inflight = new Map<string, Deferred>()

  const replay = (ctx: any, cached: CacheEntry): unknown => {
    store.hits++
    pending.set(ctx.request, { key: '', served: true })

    // Refresh recency (Map keeps insertion order), so a flood of one-off keys evicts
    // cold entries rather than the hot ones that are actually being served.
    if (store.map.get(cached.key) === cached) {
      store.map.delete(cached.key)
      store.map.set(cached.key, cached)
    }

    if (cached.kind === 'response') {
      // A Response body is a one-shot stream, so the stored bytes are rehydrated
      // into a fresh Response on every hit.
      return new Response(cached.body, {
        status: cached.status,
        headers: { ...cached.headers, 'x-cache': 'HIT' },
      })
    }

    // Replay the meta the handler set, otherwise the client gets a bare 200 with
    // whatever content-type Elysia infers and none of the handler's own headers.
    ctx.set.status = cached.status
    Object.assign(ctx.set.headers, cached.headers)
    ctx.set.headers['x-cache'] = 'HIT'
    return cached.body
  }

  const lookup = (key: string): CacheEntry | undefined => {
    const cached = store.map.get(key)
    if (cached && Date.now() >= cached.expiresAt) {
      // Evict on read so a stale entry can't be served or block the refill.
      store.map.delete(key)
      return undefined
    }
    return cached
  }

  /** Settles this request's flight (if it led one) exactly once. */
  const settle = (request: Request, entry: CacheEntry | null): void => {
    const state = pending.get(request)
    if (!state || state.served || !state.flight) return
    state.flight.resolve(entry)
    if (inflight.get(state.key) === state.flight) inflight.delete(state.key)
    state.flight = undefined
  }

  return {
    // Returned as `void` on purpose: a real return type here would widen every
    // cached route's inferred response, which Eden Treaty reads. At runtime this
    // short-circuits with exactly what the handler would have produced.
    async beforeHandle(ctx: any): Promise<void> {
      if (!eligible(ctx)) return

      const key = keyOf(ctx)
      const cached = lookup(key)
      if (cached) return replay(ctx, cached) as void

      const flight = inflight.get(key)
      if (flight) {
        const entry = await flight.promise
        if (entry) return replay(ctx, entry) as void
        // The leader's response wasn't cacheable: run the handler ourselves,
        // without leading a new flight (that would just serialise the waiters).
        store.misses++
        ctx.set.headers['x-cache'] = 'MISS'
        pending.set(ctx.request, { key, served: false, generation: store.generation })
        return
      }

      store.misses++
      ctx.set.headers['x-cache'] = 'MISS'
      const lead = deferred()
      inflight.set(key, lead)
      pending.set(ctx.request, { key, served: false, generation: store.generation, flight: lead })
    },

    async afterHandle(ctx: any): Promise<void> {
      if (!eligible(ctx)) return
      const state = pending.get(ctx.request)
      // Elysia runs afterHandle on a beforeHandle short-circuit too. Writing a
      // cache hit back would push its expiry forward on every hit, so a key
      // requested at least once per TTL would never refresh.
      if (!state || state.served) return

      // A clear while the handler ran (a write to the data behind it) makes its
      // result stale before it's stored, so neither keep it nor hand it to waiters.
      // (Checked after the await too: buffering a Response body can yield.)
      let entry = await toEntry(ctx, state.key)
      if (state.generation !== store.generation) entry = null
      if (entry) write(state.key, entry)
      settle(ctx.request, entry)
    },

    // Always runs, including when the handler threw, so waiters are never left hanging.
    afterResponse(ctx: any): void {
      settle(ctx.request, null)
      pending.delete(ctx.request)
    },
  }

  async function toEntry(ctx: any, key: string): Promise<CacheEntry | null> {
    // Which field holds the handler's return value depends on the Elysia version;
    // reading both keeps this working either way.
    const value = ctx.responseValue !== undefined ? ctx.responseValue : ctx.response
    if (value === undefined || value === null) return null

    // Never cache an error: a 404 stored here would be replayed as a 200.
    if (value instanceof ElysiaCustomStatusResponse) return null
    if (value instanceof Error) return null

    const expiresAt = Date.now() + store.ttlMs

    if (value instanceof Response) {
      if (value.status !== 200 || value.bodyUsed) return null

      const declared = Number(value.headers.get('content-length') ?? Number.NaN)
      if (Number.isFinite(declared) && declared > maxBodyBytes) return null

      try {
        const buffer = await value.clone().arrayBuffer()
        if (buffer.byteLength > maxBodyBytes) return null
        return {
          kind: 'response',
          key,
          body: buffer,
          headers: pickResponseHeaders(value.headers),
          status: value.status,
          expiresAt,
        }
      } catch {
        // Unclonable / already-consumed stream — just don't cache it.
        return null
      }
    }

    if (normalizeStatus(ctx.set.status) !== 200) return null

    return {
      kind: 'value',
      key,
      body: value,
      headers: pickHeaders(ctx.set.headers),
      status: 200,
      expiresAt,
    }
  }
}
