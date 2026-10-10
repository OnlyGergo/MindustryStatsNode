import { Elysia, status, t } from 'elysia';
import * as serverRepository from '../../repositories/serverRepository.js';
import { getNetworkPlayerHistory, getNetworkServerHistory } from '../../repositories/StatsRepository.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { getNetworkActivity, getNetworkBreakdown } from '../../repositories/networkAnalyticsRepository.js';
import { IdParam, StrictHistoryQuery, StrictNoQuery } from '../lib/schemas.js';
import { parseTimestamp, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';

export const networkRoutes = new Elysia({ prefix: '/api/networks' })
  .get('/:id/history', async ({ params, query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));
    return ApiPacker.pack(await getNetworkPlayerHistory(params.id, hoursBack, bucketMinutes, startDate, endDate));
  }, {
    params: IdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  })

  .get('/:id/history/servers', async ({ params, query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));
    return await getNetworkServerHistory(params.id, hoursBack, bucketMinutes, startDate, endDate);
  }, {
    params: IdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
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
  })
  .get('/:id/activity', async ({ params, query }) => {
    return await getNetworkActivity(params.id, Number(query.days ?? 28));
  }, {
    params: IdParam,
    query: t.Object({
      days: t.Optional(t.Union([t.Literal('7'), t.Literal('28'), t.Literal('90')])),
    }, { additionalProperties: false }),
    ...withCache({
      ttlMs: 1_800_000, // 30 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.days || '28'}`,
    }),
  })

  .get('/:id/breakdown', async ({ params }) => {
    return await getNetworkBreakdown(params.id);
  }, {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  });
