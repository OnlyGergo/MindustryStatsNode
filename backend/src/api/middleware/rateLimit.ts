import { Elysia } from 'elysia'
import { createLogger } from '../../logger.js'
import { clientIp, isLoopback, peerAddress } from '../lib/clientIp.js'

const logger = createLogger('RateLimit')

export interface RateLimitTier {
  /** Bucket name; also the Elysia plugin/store key prefix. */
  name: string
  /** Max requests per window per IP. */
  limit: number
  windowMs: number
  /**
   * First tier whose matcher accepts the request wins. `method` is passed
   * uppercased alongside `pathname` since the limiter only ever sees the URL
   * otherwise; existing single-argument matchers stay valid (the extra
   * parameter is simply unused).
   */
  match: (pathname: string, method: string) => boolean
}

interface Bucket {
  count: number
  resetAt: number
}

// Shared bucket store; keys are namespaced by `${tier.name}:${ip}` so tiers never collide,
// and a lazy sweep keeps this bounded without a timer.
const store = new Map<string, Bucket>()
const SWEEP_THRESHOLD = 20_000
let lastSweep = 0

// Time-based, never size-based: sweeping whenever the map is merely large would
// cost an O(n) walk on every request during exactly the flood it exists for.
function sweep(now: number) {
  if (now - lastSweep < (store.size > SWEEP_THRESHOLD ? 5_000 : 60_000)) return
  lastSweep = now
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
}

/**
 * Single global onRequest limiter (onRequest applies to every route on the instance it's
 * registered on, so tiers must share one plugin rather than each installing their own).
 * The first matching tier's pathname wins; paths matching none are unlimited.
 */
export const rateLimit = (tiers: RateLimitTier[]) =>
  new Elysia({ name: 'rate-limit' }).onRequest(({ request, server, set }) => {
    const pathname = new URL(request.url).pathname
    const tier = tiers.find((t) => t.match(pathname, request.method.toUpperCase()))
    if (!tier) return

    if (isLoopback(peerAddress(request, server))) return // this process's own SSR fetches

    const now = Date.now()
    const key = `${tier.name}:${clientIp(request, server)}`

    let bucket = store.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + tier.windowMs }
      store.set(key, bucket)
    }
    bucket.count++
    sweep(now)

    const remaining = Math.max(0, tier.limit - bucket.count)
    const resetSeconds = Math.ceil(bucket.resetAt / 1000)
    set.headers['x-ratelimit-limit'] = String(tier.limit)
    set.headers['x-ratelimit-remaining'] = String(remaining)
    set.headers['x-ratelimit-reset'] = String(resetSeconds)

    if (bucket.count > tier.limit) {
      if (bucket.count === tier.limit + 1) {
        logger.debug(`Rate limit tripped for ${key}`)
      }
      set.status = 429
      set.headers['retry-after'] = String(Math.max(0, resetSeconds - Math.ceil(now / 1000)))
      return { error: 'Rate limit exceeded' }
    }
  })

/**
 * Restricts a route to this machine. Spread into a route's hook options
 * (`...localOnly()`), like `withCache`. Unused today: every endpoint is reachable
 * from the browser, so locking one down needs a matching frontend change first.
 */
export const localOnly = () => ({
  beforeHandle({ request, server, set }: any) {
    if (isLoopback(peerAddress(request, server))) return
    set.status = 403
    return { error: 'Local only' }
  },
})
