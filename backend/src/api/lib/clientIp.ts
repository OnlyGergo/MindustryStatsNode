/** Minimal shape of Bun's `server.requestIP`. */
interface RequestIpServer {
  requestIP(request: Request): { address: string } | null
}

/** `::ffff:1.2.3.4` -> `1.2.3.4`, and drops any `%zone` suffix. */
function normalizeIp(ip: string): string {
  const trimmed = ip.trim().split('%')[0] ?? ''
  return /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i.test(trimmed) ? trimmed.slice(7) : trimmed
}

/** First octet pair of a dotted-quad, or null when it isn't IPv4 at all. */
function ipv4Octets(ip: string): [number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null
  return [Number(parts[0]), Number(parts[1])]
}

/** True for loopback (127.0.0.0/8, ::1) — i.e. the SSR fetches this process makes to itself. */
export function isLoopback(ip: string | null): boolean {
  if (!ip) return false
  const addr = normalizeIp(ip)
  const v4 = ipv4Octets(addr)
  if (v4) return v4[0] === 127
  return addr === '::1' || addr === '0:0:0:0:0:0:0:1'
}

/** Immediate socket peer address, or null when Bun cannot resolve it. */
export function peerAddress(request: Request, server: RequestIpServer | null): string | null {
  const address = server?.requestIP(request)?.address
  return address ? normalizeIp(address) : null
}

export interface ProxyTrust {
  /** Socket peers whose X-Forwarded-For is believed (the reverse proxy's source IPs). */
  proxies: ReadonlySet<string>
  /**
   * Trusted hops that append to X-Forwarded-For in front of that proxy. 0 when the
   * proxy talks to clients directly; 1 for Caddy behind Cloudflare, since Caddy keeps
   * Cloudflare's header and appends the Cloudflare edge address after the client.
   */
  extraHops: number
}

function parseProxyTrust(env: NodeJS.ProcessEnv): ProxyTrust {
  const list = (env.TRUSTED_PROXY_IPS ?? '127.0.0.1,::1')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean)
  const hops = parseInt(env.TRUSTED_PROXY_EXTRA_HOPS ?? '0', 10)
  return { proxies: new Set(list), extraHops: Number.isFinite(hops) && hops > 0 ? hops : 0 }
}

export const proxyTrust: ProxyTrust = parseProxyTrust(process.env)

/**
 * True only for requests this process makes to itself (SSR fetches): a loopback
 * peer that carries no X-Forwarded-For. A reverse proxy on the same box always
 * sets that header, so proxied traffic never counts as local.
 */
export function isSelfRequest(request: Request, server: RequestIpServer | null): boolean {
  return isLoopback(peerAddress(request, server)) && !request.headers.has('x-forwarded-for')
}

export interface ResolvedClient {
  ip: string
  /** True when the peer was not a trusted proxy (nor this process itself), i.e. the proxy was bypassed. */
  untrustedPeer: boolean
}

/**
 * The client IP a rate-limit bucket should be keyed on.
 *
 * X-Forwarded-For is only consulted when the immediate peer is a configured trusted
 * proxy, because anyone else can forge the header freely. Within it, the entry
 * `extraHops` from the right is the last address a trusted hop recorded; anything
 * further left is client-controlled. A header shorter than that means the request
 * did not come through the outer hops, so its only (proxy-written) entry is used.
 */
export function resolveClient(
  request: Request,
  server: RequestIpServer | null,
  trust: ProxyTrust = proxyTrust,
): ResolvedClient {
  const peer = peerAddress(request, server)
  if (!peer || !trust.proxies.has(peer)) {
    return { ip: peer ?? 'unknown', untrustedPeer: !isSelfRequest(request, server) }
  }

  const entries = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean)

  const ip = entries[Math.max(0, entries.length - 1 - trust.extraHops)] ?? peer
  return { ip, untrustedPeer: false }
}

export function clientIp(request: Request, server: RequestIpServer | null): string {
  return resolveClient(request, server).ip
}
