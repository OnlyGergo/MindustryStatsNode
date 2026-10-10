import { Elysia, status } from 'elysia';
import * as serverRepository from '../../repositories/serverRepository.js';
import { getNetworkPlayerHistory } from '../../repositories/StatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { IdParam, StrictNoQuery, StrictRangeQuery } from '../lib/schemas.js';
import { resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';

export const networkRoutes = new Elysia({ prefix: '/api/networks' })
  .get('/:id/history', async ({ params, query }) => {
    const { hoursBack, bucketMinutes } = resolveRange(query.range);
    return ApiPacker.pack(await getNetworkPlayerHistory(params.id, hoursBack, bucketMinutes));
  }, {
    params: IdParam,
    query: StrictRangeQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.range || ''}`,
    }),
  })

  .get('/:id/details', async ({ params }) => {
    const details = await serverRepository.getNetworkDetails(params.id);
    if (!details) return status(404, { error: 'Network not found' });
    return details;
  }, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  })

  .get('/:id/servers', async ({ params }) => {
    const servers = await serverRepository.getAllServerElements(36, params.id);
    return ApiPacker.pack(servers);
  }, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  });
