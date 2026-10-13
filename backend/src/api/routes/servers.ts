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

export const serverRoutes = new Elysia({ prefix: '/api' })
  .get('/servers', async () => {
    const servers = await serverRepository.getAllServerElements();
    logger.debug(`Served ${servers.length} servers from cache`);
    return ApiPacker.pack(servers);
  }, {
    query: StrictNoQuery,
    ...withCache({ ttlMs: 180_000 }), // 3 minutes TTL
  })

  .get('/servers/:id/details', async ({ params }) => {
    const server = await serverRepository.getServer(params.id);
    if (!server) return status(404, { error: 'Server not found' });
    return server;
  }, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 180_000, // 3 minutes TTL
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  })

  .get('/servers/:id/motd-history', async ({ params, query }) => {
    const { page, perPage } = parsePagination(query, 20, 100);

    const result = await getMotdHistory(params.id, page, perPage);
    return result.data;
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

    const result = await getMapHistory(params.id, page, perPage);
    return result.data;
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
