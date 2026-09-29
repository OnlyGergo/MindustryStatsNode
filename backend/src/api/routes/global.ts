import { Elysia } from 'elysia';
import { getGlobalPlayerHistory } from '../../repositories/StatsRepository.js';
import { getGlobalGamemodeHistory } from '../../repositories/GlobalStatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { StrictHistoryQuery, StrictRangeQuery } from '../lib/schemas.js';
import { parseTimestamp, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';

export const globalRoutes = new Elysia({ prefix: '/api/global' })
  .get('/history', async ({ query }) => {
    const { hoursBack, bucketMinutes } = resolveRange(query.range);
    return ApiPacker.pack(await getGlobalPlayerHistory(hoursBack, bucketMinutes));
  }, {
    query: StrictRangeQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, query }) => `${path}:${query.range || ''}`,
    }),
  })

  .get('/gamemode-history', async ({ query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));

    const history = await getGlobalGamemodeHistory(hoursBack, bucketMinutes, startDate, endDate);
    return ApiPacker.pack(history);
  }, {
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, query }) => `${path}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  });
