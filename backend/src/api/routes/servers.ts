import { Elysia, status } from 'elysia';
import { createLogger } from '../../logger.js';
import * as serverRepository from '../../repositories/serverRepository.js';
import { getMapHistory, getMotdHistory } from '../../repositories/serverRepository.js';
import { getAggregatedHistory } from '../../repositories/StatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { IdParam, StrictHistoryQuery, StrictNoQuery, StrictPaginationQuery } from '../lib/schemas.js';
import { parseTimestamp, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';
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
    const { page = '1', perPage = '20' } = query;
    const pageNumber = parseInt(page, 10) || 1;
    const perPageNumber = Math.min(parseInt(perPage, 10) || 20, 100);

    const result = await getMotdHistory(params.id, pageNumber, perPageNumber);
    return result.data;
  }, {
    params: IdParam,
    query: StrictPaginationQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.page || '1'}:${query.perPage || '20'}`,
    }),
  })

  .get('/servers/:id/map-history', async ({ params, query }) => {
    const { page = '1', perPage = '20' } = query;
    const pageNumber = parseInt(page, 10) || 1;
    const perPageNumber = Math.min(parseInt(perPage, 10) || 20, 100);

    const result = await getMapHistory(params.id, pageNumber, perPageNumber);
    return result.data;
  }, {
    params: IdParam,
    query: StrictPaginationQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.page || '1'}:${query.perPage || '20'}`,
    }),
  })

  .get('/servers/:id/history', async ({ params, query }) => {
    const startDate = parseTimestamp(query.startDate);
    const endDate = parseTimestamp(query.endDate);
    const { hoursBack, bucketMinutes } = resolveRange(query.range, startDate, endDate);

    return ApiPacker.pack(await getAggregatedHistory(params.id, hoursBack, bucketMinutes, startDate, endDate));
  }, {
    params: IdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  });
