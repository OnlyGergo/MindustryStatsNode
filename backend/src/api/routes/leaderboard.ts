import { Elysia, status } from 'elysia';
import { getLeaderboard } from '../../services/leaderboardScheduler.js';

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
  });
