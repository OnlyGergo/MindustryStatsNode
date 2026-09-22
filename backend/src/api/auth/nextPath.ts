// ─────────────────────────────────────────────────────────────────────────────
// nextPath.ts
// Sanitises the `?next=` query param on `GET /api/auth/discord` so it can only
// ever send the browser back to a same-origin, non-API path -- never off-site
// (open redirect) and never back into the API itself.
//
// Pure: takes `siteOrigin` as a parameter rather than importing config/env.ts,
// so it is trivially unit-testable with no environment set up.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LENGTH = 512;

// Control chars (incl. tab/newline/CR) and any whitespace -- a raw value must
// not contain these before we even try to parse it as a URL.
// eslint-disable-next-line no-control-regex
const HAS_CONTROL_OR_WHITESPACE = /[\x00-\x20\x7f\s]/;

/**
 * Returns a safe same-origin path (`pathname + search + hash`) to redirect to
 * after login, or `'/'` when `raw` is missing, malformed, off-origin, or
 * targets the API.
 */
export function safeNextPath(raw: unknown, siteOrigin: string): string {
  const FALLBACK = '/';

  if (typeof raw !== 'string') return FALLBACK;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return FALLBACK;

  // Must start with a single '/' -- rules out protocol-relative ('//evil.com'),
  // backslash tricks browsers treat as '/' ('/\evil.com', '\\evil.com'), and
  // absolute URLs/schemes ('https://…', 'javascript:…').
  if (raw[0] !== '/') return FALLBACK;
  if (raw[1] === '/' || raw[1] === '\\') return FALLBACK;
  if (raw.includes('\\')) return FALLBACK;
  if (HAS_CONTROL_OR_WHITESPACE.test(raw)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(raw, siteOrigin);
  } catch {
    return FALLBACK;
  }

  if (url.origin !== siteOrigin) return FALLBACK;
  if (url.pathname.startsWith('/api/')) return FALLBACK;

  return url.pathname + url.search + url.hash;
}
