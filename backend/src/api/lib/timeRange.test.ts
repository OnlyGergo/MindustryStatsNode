import { describe, expect, test } from 'bun:test';
import { resolveRange } from './timeRange.js';

const HOUR = 60 * 60 * 1000;

describe('resolveRange', () => {
  test('honours a sane custom window', () => {
    const end = Date.now();
    const r = resolveRange(undefined, end - 48 * HOUR, end);
    expect(r).toMatchObject({ hoursBack: 48, startDate: end - 48 * HOUR, endDate: end });
  });

  test('clamps an over-wide window to 400 days', () => {
    const end = Date.now();
    const r = resolveRange(undefined, 0, end);
    expect(r.hoursBack).toBe(24 * 400);
    expect(r.startDate).toBe(end - 24 * 400 * HOUR);
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
});
