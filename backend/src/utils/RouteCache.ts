import { Elysia } from 'elysia'

// Global or shared in-memory storage (or swap with Redis)
const cacheStore = new Map<string, { data: unknown; expiry: number }>()

interface CacheOptions<TQuery = Record<string, unknown>, TParams = Record<string, unknown>> {
  ttlMs?: number
  /**
   * Lambda function to generate a strict, normalized key from validated inputs
   */
  getKey?: (ctx: { query: TQuery; params: TParams; path: string }) => string
}

export const withCache = <TQuery = any, TParams = any>(options: CacheOptions<TQuery, TParams>) => {
  const ttl = options.ttlMs ?? 60_000 // Default 60s TTL
  const getKey = options.getKey ?? (({ path }) => path)

  return new Elysia({ name: `cache-plugin-${Math.random()}` })
    .onBeforeHandle(({ query, params, path, set }) => {
      // Generate key ONLY from parameters passed into the lambda
      const key = getKey({
        query: query as TQuery,
        params: params as TParams,
        path
      })

      const cached = cacheStore.get(key)
      if (cached && Date.now() < cached.expiry) {
        set.headers['x-cache'] = 'HIT'
        return cached.data // Instantly returns and skips route handler
      }
    })
    .onAfterHandle(({ query, params, path, responseValue }) => {
      if (!responseValue) return

      const key = getKey({
        query: query as TQuery,
        params: params as TParams,
        path
      })

      cacheStore.set(key, {
        data: responseValue,
        expiry: Date.now() + ttl
      })
    })
}