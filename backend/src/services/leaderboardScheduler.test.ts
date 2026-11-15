import { describe, expect, test } from 'bun:test';
import { nextSlot, rebuildLeaderboard, getLeaderboard, requestLeaderboardRebuild } from './leaderboardScheduler.js';
import type { LeaderboardSections } from '../../../common/models/leaderboard.js';

const at = (iso: string) => new Date(iso);

describe('nextSlot', () => {
  test('before 07:00 gives 07:00 the same day', () => {
    expect(nextSlot(at('2026-03-10T06:59:00Z')).toISOString()).toBe('2026-03-10T07:00:00.000Z');
  });
  test('exactly 07:00 is strictly after, so 19:00', () => {
    expect(nextSlot(at('2026-03-10T07:00:00Z')).toISOString()).toBe('2026-03-10T19:00:00.000Z');
  });
  test('midday gives 19:00', () => {
    expect(nextSlot(at('2026-03-10T12:00:00Z')).toISOString()).toBe('2026-03-10T19:00:00.000Z');
  });
  test('exactly 19:00 gives 07:00 next day', () => {
    expect(nextSlot(at('2026-03-10T19:00:00Z')).toISOString()).toBe('2026-03-11T07:00:00.000Z');
  });
  test('rolls over the year', () => {
    expect(nextSlot(at('2026-12-31T23:30:00Z')).toISOString()).toBe('2027-01-01T07:00:00.000Z');
  });
});

describe('rebuildLeaderboard', () => {
  const empty = {} as LeaderboardSections;

  test('builds windows ending now and coalesces concurrent calls', async () => {
    const calls: [number, number, number][] = [];
    const deps = {
      log: () => {},
      now: () => at('2026-03-10T12:00:00Z'),
      build: async (s: Date, e: Date, f: number) => { calls.push([e.getTime() - s.getTime(), e.getTime(), f]); return empty; },
    };
    const [a, b] = await Promise.all([rebuildLeaderboard(deps), rebuildLeaderboard(deps)]);
    expect(a).toBe(b);
    expect(calls.map((c) => c[0] / 3_600_000)).toEqual([24, 168, 720]);
    expect(calls.map((c) => c[2])).toEqual([5, 20, 50]);
    expect(a.nextRefreshAt).toBe(at('2026-03-10T19:00:00Z').getTime());
    expect(getLeaderboard()).toBe(a);
  });

  test('a failed rebuild keeps the previous report and rethrows', async () => {
    const good = getLeaderboard();
    const deps = { log: () => {}, now: () => new Date(), build: async () => { throw new Error('db down'); } };
    await expect(rebuildLeaderboard(deps)).rejects.toThrow('db down');
    expect(getLeaderboard()).toBe(good);
  });
});

describe('requestLeaderboardRebuild', () => {
  const empty = {} as LeaderboardSections;
  const settle = () => new Promise((r) => setTimeout(r, 20));

  test('while idle, builds once', async () => {
    let calls = 0;
    const deps = { log: () => {}, now: () => new Date(), build: async () => { calls++; return empty; } };
    requestLeaderboardRebuild(deps);
    await settle();
    expect(calls).toBe(3); // one build = one call per window
  });

  test('requests during an in-flight build cause exactly one extra build', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const deps = {
      log: () => {},
      now: () => new Date(),
      build: async () => { calls++; if (calls === 1) await gate; return empty; },
    };
    const first = rebuildLeaderboard(deps);
    await Promise.resolve();
    requestLeaderboardRebuild(deps);
    requestLeaderboardRebuild(deps);
    requestLeaderboardRebuild(deps);
    release();
    await first;
    await settle();
    expect(calls).toBe(6); // two builds x 3 windows
  });
});
