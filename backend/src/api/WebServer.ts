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
  { name: 'entity', limit: 40, windowMs: MINUTE, match: (p) => ENTITY_PATH.test(p) },
  { name: 'api', limit: 120, windowMs: MINUTE, match: (p) => p.startsWith('/api') || p === '/config' || p === '/sitemap.xml' },
  // SSR pages embed the same data the API serves (/server/:id renders its details
  // server-side), so leaving them open would just move the crawl one layer up.
  { name: 'page', limit: 40, windowMs: MINUTE, match: (p) => !STATIC_ASSET.test(p) },
];

async function loadSsrHandler(): Promise<(request: Request) => Promise<Response>> {
  const serverBuildPath = path.join(process.cwd(), 'public/server/server.js');
  const { default: { fetch } } = await import(serverBuildPath);
  return fetch;
}

/**
 * The full HTTP surface: rate limiting, CORS, static assets, the API, and the
 * TanStack SSR handler as the catch-all.
 */
export async function createWebServer() {
  const handleSsrRequest = await loadSsrHandler();
  initCache({ sweepIntervalMs: 60_000 })

  return new Elysia()
    // Ahead of everything, including the route cache — a crawler must not get
    // unmetered hits just because its target happens to be cached.
    .use(rateLimit(rateLimitTiers))
    .use(cors({ origin: apiConfig.CORS_ORIGIN, credentials: true }))
    .use(staticPlugin({ assets: path.join(process.cwd(), 'public/client'), prefix: '/' }))
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
