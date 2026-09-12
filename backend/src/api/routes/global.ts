import { Elysia } from 'elysia';
import { getGlobalPlayerHistory } from '../../repositories/StatsRepository.js';
import { getGlobalGamemodeHistory } from '../../repositories/GlobalStatsRepository.js';
import { getGlobalEvents } from '../../repositories/ServerEventsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { StrictHistoryQuery, StrictRangeQuery } from '../lib/schemas.js';
import { parseTimestamp, resolveRange, resolveWindow } from '../lib/timeRange.js';
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
    // Note: unlike /api/servers/:id/history, range alone drives hoursBack here —
    // startDate/endDate are only forwarded to the repo as extra filters.
    const { hoursBack, bucketMinutes } = resolveRange(query.range);
    const startDate = parseTimestamp(query.startDate);
    const endDate = parseTimestamp(query.endDate);

    const history = await getGlobalGamemodeHistory(hoursBack, bucketMinutes, startDate, endDate);
    return ApiPacker.pack(history);
  }, {
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, query }) => `${path}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  })

  // Annotations for the charts that have no server of their own: the events with
  // no server_id, resolved over the same window /history uses.
  .get('/events', async ({ query }) => {
    const startDate = parseTimestamp(query.startDate);
    const endDate = parseTimestamp(query.endDate);
    const { startMs, endMs } = resolveWindow(query.range, startDate, endDate);

    return ApiPacker.pack(await getGlobalEvents(startMs, endMs));
  }, {
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 300_000, // 5 minutes TTL, matching the history it annotates
      getKey: ({ path, query }) => `${path}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  });
