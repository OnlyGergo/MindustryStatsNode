import { Elysia } from 'elysia';
import { cors } from '@elysia/cors';
import { staticPlugin } from '@elysia/static';
import path from 'path';
import { createLogger } from '../logger.js';
import { api } from './app.js';
import { apiConfig } from './context.js';
import { rateLimit, type RateLimitTier } from './middleware/rateLimit.js';
import { initCache, stopCache } from './middleware/cache.js';

const logger = createLogger('WebServer');

const MINUTE = 60_000;

/** Per-entity endpoints: one request per server/network/gamemode, so this is the crawl surface. */
const ENTITY_PATH = /^\/api\/(servers\/[^/]+\/|networks\/|gamemodes\/[^/]+\/servers)/;
/** Built assets — a single page load pulls a dozen, so they must not eat a page budget. */
const STATIC_ASSET = /^\/assets\/|\.[a-z0-9]+$/i;

/**
 * Budgets are sized so a person clicking around never notices them, while a
 * sweep of the ~300 tracked servers takes long enough not to be worth doing.
 * Loopback is exempt inside the limiter, which covers our own SSR fetches.
 */
const rateLimitTiers: RateLimitTier[] = [
  // Mutations first, so a write never falls through to the looser read tiers
  // just because its path also matches ENTITY_PATH or /api. The OAuth
  // redirect/callback are GETs, so they land in 'auth'.
  { name: 'write', limit: 30, windowMs: MINUTE, match: (p, m) => p.startsWith('/api/') && m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' },
  { name: 'auth', limit: 20, windowMs: MINUTE, match: (p) => p.startsWith('/api/auth/') },
  { name: 'entity', limit: 40, windowMs: MINUTE, match: (p) => ENTITY_PATH.test(p) },
  { name: 'api', limit: 120, windowMs: MINUTE, match: (p) => p.startsWith('/api') || p === '/config' || p === '/sitemap.xml' },
  // SSR pages embed the same data the API serves (/server/:id renders its details
  // server-side), so leaving them open would just move the crawl one layer up.
  { name: 'page', limit: 40, windowMs: MINUTE, match: (p) => !STATIC_ASSET.test(p) },
];

type SsrHandler = (request: Request) => Promise<Response>;

/**
 * Where the production frontend build lives: FRONTEND_DIST if set, else
 * `frontend/dist` next to this package - true both in the repo and in the
 * build.sh release layout, so a `bun run build` needs no copying.
 */
function resolveFrontendDist(): string {
  if (process.env.FRONTEND_DIST) return path.resolve(process.env.FRONTEND_DIST);
  return path.resolve(import.meta.dir, '../../../frontend/dist');
}

async function loadSsrHandler(distDir: string): Promise<SsrHandler> {
  const serverBuildPath = path.join(distDir, 'server/server.js');
  const { default: { fetch } } = await import(serverBuildPath);
  return fetch;
}

/**
 * Dev mode: forward every page/asset request to the Vite dev server, which SSRs
 * from source and serves unminified modules with source maps. The browser still
 * talks to this port, so cookies, SITE_ORIGIN and the OAuth callback behave the
 * same as production. HMR's websocket goes straight to Vite (see vite.config.ts).
 */
function viteDevProxy(devUrl: string): SsrHandler {
  const target = new URL(devUrl);
  return async (request) => {
    const url = new URL(request.url);
    url.protocol = target.protocol;
    url.host = target.host;

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
      });
    } catch {
      return new Response(`Vite dev server is not reachable at ${target.origin} - run \`bun run dev\` from the repo root.`, {
        status: 502,
      });
    }

    // fetch has already decoded the body, so the upstream encoding/length no longer apply.
    const headers = new Headers(upstream.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  };
}

/**
 * The full HTTP surface: rate limiting, CORS, static assets, the API, and the
 * TanStack SSR handler as the catch-all.
 */
export async function createWebServer() {
  const devUrl = process.env.FRONTEND_DEV_URL;
  const distDir = resolveFrontendDist();
  const handleSsrRequest = devUrl ? viteDevProxy(devUrl) : await loadSsrHandler(distDir);
  logger.info(devUrl ? `Frontend: proxying to Vite dev server at ${devUrl}` : `Frontend: serving build from ${distDir}`);
  initCache({ sweepIntervalMs: 60_000 })

  const app = new Elysia()
    // Ahead of everything, including the route cache — a crawler must not get
    // unmetered hits just because its target happens to be cached.
    .use(rateLimit(rateLimitTiers))
    .use(cors({ origin: apiConfig.CORS_ORIGIN, credentials: true }));

  // In dev Vite serves the client assets itself, via the catch-all below.
  // alwaysStatic: otherwise, outside NODE_ENV=production, the plugin mounts a
  // `/*` wildcard that answers 404 for every page before SSR gets a look.
  if (!devUrl) app.use(staticPlugin({ assets: path.join(distDir, 'client'), prefix: '/', alwaysStatic: true }));

  return app
    .use(api)
    .all('*', async ({ request, status }) => {
      if (new URL(request.url).pathname.startsWith('/api')) {
        return status(404, { error: 'what are you doing buddy ?' });
      }

      try {
        // Pass the native Request object into TanStack's server handler
        return await handleSsrRequest(request);
      } catch (error) {
        logger.error('SSR rendering error:', error);
        return status(500, 'Internal Server Error');
      }
    });
}

let server: Awaited<ReturnType<typeof createWebServer>> | undefined;

export async function startWebServer(): Promise<void> {
  logger.info('Starting web server...');
  server = await createWebServer();
  server.listen(apiConfig.PORT, () => {
    logger.info(`HTTP server listening on port ${apiConfig.PORT}`);
  });
}

export async function stopWebServer(): Promise<void> {
  await server?.stop();
  stopCache();
  server = undefined;
  logger.info('Web server stopped');
}
