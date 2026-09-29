import { Elysia } from 'elysia';
import { getGamemodeList, getServerShareByGamemode } from '../../repositories/GlobalStatsRepository.js';
import { removeColorsFromMindustry } from '../../../../common/Mindustry.js';
import { type ServerShareEntry } from '../../../../common/models/GlobalStatsTypes.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { ModeIdParam, StrictHistoryQuery, StrictNoQuery } from '../lib/schemas.js';
import { parseTimestamp, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';

export const gamemodeRoutes = new Elysia({ prefix: '/api/gamemodes' })
  .get('', async () => ApiPacker.pack(await getGamemodeList()), {
    query: StrictNoQuery,
    ...withCache({ ttlMs: 600_000 }), // 10 minutes TTL
  })

  .get('/:modeId/servers', async ({ params, query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));

    const serverShare = await getServerShareByGamemode(params.modeId, hoursBack, bucketMinutes, startDate, endDate);

    return ApiPacker.pack(serverShare.map((item): ServerShareEntry => ({
      ...item,
      groupName: removeColorsFromMindustry(item.groupName) ?? 'Null',
      serverName: removeColorsFromMindustry(item.serverName) ?? 'Null',
    })));
  }, {
    params: ModeIdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.modeId}:${query.range || ''}:${query.startDate || ''}:${query.endDate || ''}`,
    }),
  });
