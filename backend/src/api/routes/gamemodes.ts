import { Elysia } from 'elysia';
import { getGamemodeList, getServerShareByGamemode } from '../../repositories/GlobalStatsRepository.js';
import { removeColorsFromMindustry } from '../../../../common/Mindustry.js';
import { type ServerShareEntry } from '../../../../common/models/GlobalStatsTypes.js';
import { ApiPacker } from '../../../../common/Packer.js';
import { ModeIdParam, StrictHistoryQuery, StrictNoQuery } from '../lib/schemas.js';
import { parseTimestamp, rangeKey, resolveRange } from '../lib/timeRange.js';
import { withCache } from '../middleware/cache.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Api');

/** Full scan of server_maps_history: the global page's SSR waits on it, so never cold after the first fill. */
const STALE_MS = 6 * 60 * 60_000;

const listGamemodes = async () => ApiPacker.pack(await getGamemodeList());

export const gamemodeRoutes = new Elysia({ prefix: '/api/gamemodes' })
  .get('', listGamemodes, {
    query: StrictNoQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      staleWhileRevalidate: {
        staleMs: STALE_MS,
        refresh: listGamemodes,
        onError: (error, key) => logger.warn(`Background refresh of ${key} failed:`, error),
      },
    }),
  })

  .get('/:modeId/servers', async ({ params, query }) => {
    const { hoursBack, bucketMinutes, startDate, endDate } = resolveRange(
      query.range, parseTimestamp(query.startDate), parseTimestamp(query.endDate));

    const serverShare = await getServerShareByGamemode(params.modeId, hoursBack, bucketMinutes, startDate, endDate);

    return ApiPacker.pack(serverShare.map((item): ServerShareEntry => ({
      ...item,
      groupName: removeColorsFromMindustry(item.groupName) ?? 'Null',
    })));
  }, {
    params: ModeIdParam,
    query: StrictHistoryQuery,
    ...withCache({
      ttlMs: 600_000, // 10 minutes TTL
      getKey: ({ path, params, query }) => `${path}:${params.modeId}:${rangeKey(query.range, query.startDate, query.endDate)}`,
    }),
  });
