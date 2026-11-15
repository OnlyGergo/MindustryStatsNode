import { Elysia, status, t } from 'elysia';
import { getLeaderboard } from '../../services/leaderboardScheduler.js';
import { getWrapped } from '../../services/wrappedService.js';

export const leaderboardRoutes = new Elysia({ prefix: '/api/leaderboard' })
  // The report is already in memory, so no withCache; lists are <= 20 rows, so no ApiPacker.
  .get('/', ({ set }) => {
    const report = getLeaderboard();
    if (!report) {
      set.headers['cache-control'] = 'no-store';
      return status(503, { building: true as const });
    }
    set.headers['cache-control'] = 'public, max-age=300';
    return report;
  })
  // Year in review: year to date while the year is open, final afterwards.
  // The service keeps its own per-year cache and builds off the request path.
  .get('/wrapped/:year', async ({ params, set }) => {
    const result = await getWrapped(params.year);
    if (result.kind === 'not_found') {
      set.headers['cache-control'] = 'no-store';
      return status(404, { error: 'No data for that year' });
    }
    if (result.kind === 'building') {
      set.headers['cache-control'] = 'no-store';
      return status(503, { building: true as const });
    }
    set.headers['cache-control'] = 'public, max-age=300';
    return result.report;
  }, { params: t.Object({ year: t.Numeric({ minimum: 2000, maximum: 2100 }) }) });
