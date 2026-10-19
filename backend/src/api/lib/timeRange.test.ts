import { describe, expect, test } from 'bun:test';
import { rangeKey, resolveRange } from './timeRange.js';

const HOUR = 60 * 60 * 1000;

describe('resolveRange', () => {
  test('honours a sane custom window', () => {
    const end = Date.now();
    const r = resolveRange(undefined, end - 48 * HOUR, end);
    expect(r.hoursBack).toBe(48);
    // Snapped down to the bucket grid, so it can only ever move backwards by < 1 bucket.
    const bucketMs = r.bucketMinutes * 60_000;
    expect(r.endDate! % bucketMs).toBe(0);
    expect(end - r.endDate!).toBeLessThan(bucketMs);
    expect(r.startDate! % bucketMs).toBe(0);
  });

  test('clamps an over-wide window to 400 days', () => {
    const end = Date.now();
    const r = resolveRange(undefined, 0, end);
    expect(r.hoursBack).toBe(24 * 400);
    expect(end - 24 * 400 * HOUR - r.startDate!).toBeLessThanOrEqual(r.bucketMinutes * 60_000);
  });

  test('startDate=0 is a real bound, not "unset"', () => {
    const r = resolveRange(undefined, 0, 2 * HOUR);
    expect(r).toMatchObject({ hoursBack: 2, startDate: 0, endDate: 2 * HOUR });
  });

  test('falls back to range for far-future, reversed or half-open windows', () => {
    const now = Date.now();
    for (const [s, e] of [[0, 9e15], [now, now - HOUR], [now - HOUR, undefined], [-5, now]] as const) {
      const r = resolveRange('7d', s, e);
      expect(r).toEqual({ hoursBack: 168, bucketMinutes: 60 });
    }
  });

  test('nudging a custom window by milliseconds cannot mint a new cache key', () => {
    const end = Date.now();
    const start = end - 48 * HOUR;
    const base = rangeKey(undefined, String(start), String(end));
    expect(rangeKey(undefined, String(start + 1), String(end - 1))).toBe(base);
  });
});

describe('rangeKey', () => {
  test('junk, empty and missing ranges all resolve to the one default entry', () => {
    const k = rangeKey();
    for (const r of ['', 'bogus', '24h', '7d; DROP']) expect(rangeKey(r)).toBe(k);
  });

  test('a half-supplied or invalid custom window is ignored, like resolveRange', () => {
    expect(rangeKey('7d', '123', undefined)).toBe(rangeKey('7d'));
    expect(rangeKey('7d', 'abc', 'def')).toBe(rangeKey('7d'));
  });
});
