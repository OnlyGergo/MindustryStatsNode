import { Elysia, status } from 'elysia';
import { createLogger } from '../../logger.js';
import * as serverRepository from '../../repositories/serverRepository.js';
import { getMapHistory, getMotdHistory } from '../../repositories/serverRepository.js';
import { getAggregatedHistory } from '../../repositories/StatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { IdParam, StrictHistoryQuery, StrictNoQuery, StrictPaginationQuery } from '../lib/schemas.js';
import { parseTimestamp, rangeKey, resolveRange } from '../lib/timeRange.js';
import { paginationKey, parsePagination } from '../lib/pagination.js';
import { withCache } from '../middleware/cache.js';
import { getServerCustomisation } from '../../repositories/customisationReadRepository.js';
const logger = createLogger('Api');

/**
 * How long past its TTL a list/details entry is still served while it refreshes
 * in the background. Every SSR page waits on /api/servers, so without this
 * whoever arrives just after the TTL pays the whole query.
 */
const STALE_MS = 30 * 60_000;
const logRefreshError = (error: unknown, key: string) => logger.warn(`Background refresh of ${key} failed:`, error);

const listServers = async () => {
  const servers = await serverRepository.getAllServerElements();
  logger.debug(`Served ${servers.length} servers from cache`);
  return ApiPacker.pack(servers);
};

const serverDetails = async ({ params }: { params: { id: number } }) => {
  const server = await serverRepository.getServer(params.id);
  if (!server) return status(404, { error: 'Server not found' });
  return server;
};

export const serverRoutes = new Elysia({ prefix: '/api' })
  .get('/servers', listServers, {
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 180_000, // 3 minutes TTL
      staleWhileRevalidate: { staleMs: STALE_MS, refresh: listServers, onError: logRefreshError },
    }),
  })

  .get('/servers/:id/details', serverDetails, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 180_000, // 3 minutes TTL
      getKey: ({ path, params }) => `${path}:${params.id}`,
      staleWhileRevalidate: { staleMs: STALE_MS, refresh: serverDetails, onError: logRefreshError },
    }),
  })

  .get('/servers/:id/motd-history', async ({ params, query }) => {
    const { page, perPage } = parsePagination(query, 20, 100);

    return getMotdHistory(params.id, page, perPage);
  }, {
    params: IdParam,
    query: StrictPaginationQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${paginationKey(parsePagination(query, 20, 100))}`,
    }),
  })

  .get('/servers/:id/map-history', async ({ params, query }) => {
    const { page, perPage } = parsePagination(query, 20, 100);

    return getMapHistory(params.id, page, perPage);
  }, {
    params: IdParam,
    query: StrictPaginationQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${paginationKey(parsePagination(query, 20, 100))}`,
    }),
  })

  .get('/servers/:id/history', async ({ params, query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));

    return ApiPacker.pack(await getAggregatedHistory(params.id, hoursBack, bucketMinutes, startDate, endDate));
  }, {
    params: IdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${rangeKey(query.range, query.startDate, query.endDate)}`,
    }),
  })

  // Accent colour + background, the server's settings over its network's. Owner writes clear this store.
  .get('/servers/:id/customisation', async ({ params }) => {
    const customisation = await getServerCustomisation(params.id);
    if (!customisation) return status(404, { error: 'Server not found' });
    return customisation;
  }, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      name: 'customisation',
      ttlMs: 60_000,
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  });
