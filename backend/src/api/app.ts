import { Elysia } from 'elysia';
import { createLogger } from '../logger.js';
import { authPlugin } from './auth/plugin.js';
import { metaRoutes } from './routes/meta.js';
import { serverRoutes } from './routes/servers.js';
import { networkRoutes } from './routes/networks.js';
import { globalRoutes } from './routes/global.js';
import { gamemodeRoutes } from './routes/gamemodes.js';
import { serverListRoutes } from './routes/serverLists.js';

const logger = createLogger('Api');

// Elysia's own outcomes (422 validation, 404, malformed body) already carry a
// sensible response, so only genuinely unexpected throws are turned into a 500.
const PASS_THROUGH = new Set<string | number>(['VALIDATION', 'NOT_FOUND', 'PARSE']);

/**
 * The API surface on its own — routes and error handling, no transport concerns.
 * Kept free of CORS/static/SSR/listen (those live in WebServer.ts) so it stays a
 * plain value whose type Eden Treaty can consume from the frontend.
 */
export const api = new Elysia({ name: 'api' })
  .onError({ as: 'global' }, ({ code, error, set }) => {
    if (PASS_THROUGH.has(code)) return;
    logger.error(`Unhandled API error [${code}]:`, error);
    set.status = 500;
    return { error: 'Internal server error' };
  })
  .use(authPlugin)
  .use(metaRoutes)
  .use(serverRoutes)
  .use(networkRoutes)
  .use(globalRoutes)
  .use(gamemodeRoutes)
  .use(serverListRoutes);

export type Api = typeof api;
