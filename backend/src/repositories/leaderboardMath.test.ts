import { describe, expect, test } from 'bun:test';
import { deltaOf, pickMovers, previousRanks, rankTop, shareOf } from './leaderboardMath.js';

const e = (key: number, cur: number, prev: number) => ({ key, cur, prev });

describe('rankTop', () => {
  test('ranks by cur, maps prevRank from the previous ordering, null for NEW', () => {
    const r = rankTop([e(1, 10, 30), e(2, 50, 20), e(3, 20, 0), e(4, 0, 99)], 10);
    expect(r.map((x) => [x.key, x.rank, x.prevRank])).toEqual([[2, 1, 3], [3, 2, null], [1, 3, 2]]);
  });
  test('previous ranks beyond the limit are NEW', () => {
    const entries = Array.from({ length: 5 }, (_, i) => e(i + 1, 100 - i, 100 - i));
    const r = rankTop(entries, 5, 3);
    expect(r.map((x) => x.prevRank)).toEqual([1, 2, 3, null, null]);
  });
  test('ties break by key and respect the limit', () => {
    const r = rankTop([e(2, 5, 0), e(1, 5, 0), e(3, 5, 0)], 2);
    expect(r.map((x) => x.key)).toEqual([1, 2]);
  });
});

describe('previousRanks', () => {
  test('skips prev = 0', () => {
    expect([...previousRanks([e(1, 5, 0), e(2, 5, 3)]).entries()]).toEqual([[2, 1]]);
  });
});

describe('deltaOf', () => {
  test('pct is null when prev is 0', () => {
    expect(deltaOf(10, 0)).toEqual({ delta: 10, deltaPct: null });
    expect(deltaOf(15, 10)).toEqual({ delta: 5, deltaPct: 0.5 });
    expect(deltaOf(5, 10)).toEqual({ delta: -5, deltaPct: -0.5 });
  });
});

describe('pickMovers', () => {
  const data = [e(1, 30, 10), e(2, 2, 1), e(3, 5, 25), e(4, 12, 12), e(5, 8, 0)];
  test('risers need the floor in either window and a positive delta', () => {
    expect(pickMovers(data, 5, 10, 'up').map((x) => x.key)).toEqual([1, 5]);
  });
  test('fallers sorted most negative first', () => {
    expect(pickMovers(data, 5, 10, 'down').map((x) => x.key)).toEqual([3]);
  });
  test('limit applies', () => {
    expect(pickMovers(data, 5, 1, 'up').map((x) => x.key)).toEqual([1]);
  });
});

describe('shareOf', () => {
  test('fraction of the total, zero for empty total', () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(5, 0)).toBe(0);
  });
});
