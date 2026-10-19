// ─────────────────────────────────────────────────────────────────────────────
// originGuard.ts
// CSRF defence for cookie-authenticated mutations: a non-safe request must
// carry `Origin: <SITE_ORIGIN>` exactly. Safe methods (GET/HEAD/OPTIONS) are
// never guarded -- they must stay side-effect free on their own. Routes opt in
// with the `requireOrigin` macro in plugin.ts.
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Pure: no Elysia context needed, so it is trivial to unit test. */
export function isSameOrigin(request: Request, siteOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const origin = request.headers.get('origin');
  if (!origin) return false;

  return origin === siteOrigin;
}
