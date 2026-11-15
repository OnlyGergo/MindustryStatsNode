import { Elysia } from 'elysia';
import { getGlobalPlayerHistory } from '../../repositories/StatsRepository.js';
import { getGlobalGamemodeHistory } from '../../repositories/GlobalStatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { StrictHistoryQuery, StrictRangeQuery } from '../lib/schemas.js';
import { parseTimestamp, rangeKey, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Api');

/**
 * Served past its TTL while a background refresh runs: the global page's SSR
 * waits on the default range, so nobody should pay the query cold.
 */
const STALE_MS = 60 * 60_000;
const logRefreshError = (error: unknown, key: string) => logger.warn(`Background refresh of ${key} failed:`, error);

const gamemodeHistory = async ({ query }: { query: { range?: string; startDate?: string; endDate?: string } }) => {
  const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
    query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));
  return getGlobalGamemodeHistory(hoursBack, bucketMinutes, startDate, endDate);
};

export const globalRoutes = new Elysia({ prefix: '/api/global' })
  .get('/history', async ({ query }) => {
    const { hoursBack, bucketMinutes } = resolveRange(query.range);
    return ApiPacker.pack(await getGlobalPlayerHistory(hoursBack, bucketMinutes));
  }, {
    query: StrictRangeQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL
      getKey: ({ path, query }) => `${path}:${rangeKey(query.range)}`,
    }),
  })

  .get('/gamemode-history', gamemodeHistory, {
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, query }) => `${path}:${rangeKey(query.range, query.startDate, query.endDate)}`,
      staleWhileRevalidate: { staleMs: STALE_MS, refresh: gamemodeHistory, onError: logRefreshError },
    }),
  });
