import { describe, expect, test } from 'bun:test';
import { createWrappedService, rangeOf, shiftYears } from './wrappedService.js';
import type { WrappedReport } from '../../../common/models/leaderboard.js';

const at = (iso: string) => new Date(iso);
const noLog = () => {};

function setup(dataStart: Date | null = at('2024-05-01T00:00:00Z')) {
  const builds: { year: number; start: string; end: string; final: boolean }[] = [];
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;
  let fail = false;
  const svc = createWrappedService({
    now: () => at('2026-03-10T12:00:00Z'),
    getDataStart: async () => dataStart,
    log: noLog,
    build: async (range, ds) => {
      builds.push({ year: range.year, start: range.start.toISOString(), end: range.end.toISOString(), final: range.final });
      if (gate) await gate;
      if (fail) throw new Error('boom');
      return { year: range.year, final: range.final, asOf: range.end.getTime(), dataStart: ds.getTime() } as WrappedReport;
    },
  });
  return {
    svc,
    builds,
    hold() { gate = new Promise((r) => (release = r)); },
    open() { release?.(); gate = null; },
    failNext(v: boolean) { fail = v; },
  };
}

describe('rangeOf', () => {
  test('mid-year is year to date', () => {
    const r = rangeOf(2026, at('2026-03-10T12:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-10T12:00:00.000Z');
    expect(r.final).toBe(false);
  });
  test('after year end is the full final year', () => {
    const r = rangeOf(2025, at('2026-03-10T12:00:00Z'));
    expect(r.end.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.final).toBe(true);
  });
  test('exactly Jan 1 next year is final', () => {
    expect(rangeOf(2025, at('2026-01-01T00:00:00Z')).final).toBe(true);
  });
});

describe('getWrapped', () => {
  const now = at('2026-03-10T12:00:00Z');

  test('404 for a future year, a pre-2000 year and a year before the data', async () => {
    const t = setup();
    expect((await t.svc.getWrapped(2027, now)).kind).toBe('not_found');
    expect((await t.svc.getWrapped(1999, now)).kind).toBe('not_found');
    expect((await t.svc.getWrapped(2023, now)).kind).toBe('not_found');
    expect(t.builds).toHaveLength(0);
  });

  test('404 when there is no data at all', async () => {
    const t = setup(null);
    expect((await t.svc.getWrapped(2026, now)).kind).toBe('not_found');
  });

  test('building, then ok once the build finishes; builds are coalesced', async () => {
    const t = setup();
    t.hold();
    expect((await t.svc.getWrapped(2026, now)).kind).toBe('building');
    expect((await t.svc.getWrapped(2026, now)).kind).toBe('building');
    t.open();
    await t.svc.idle();
    expect(t.builds).toHaveLength(1);
    const r = await t.svc.getWrapped(2026, now);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.report.final).toBe(false);
  });

  test('a stale open year is served while it rebuilds in the background', async () => {
    const t = setup();
    await t.svc.getWrapped(2026, now);
    await t.svc.idle();
    // Same slot: fresh, no rebuild.
    expect((await t.svc.getWrapped(2026, at('2026-03-10T18:59:00Z'))).kind).toBe('ok');
    await t.svc.idle();
    expect(t.builds).toHaveLength(1);
    // Past the 19:00 slot: stale report returned, rebuild starts.
    t.hold();
    const later = at('2026-03-10T19:01:00Z');
    const r = await t.svc.getWrapped(2026, later);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.report.asOf).toBe(now.getTime());
    expect(t.builds).toHaveLength(2);
    t.open();
    await t.svc.idle();
    const r2 = await t.svc.getWrapped(2026, later);
    if (r2.kind === 'ok') expect(r2.report.asOf).toBe(later.getTime());
  });

  test('a failed rebuild keeps the old entry', async () => {
    const t = setup();
    await t.svc.getWrapped(2026, now);
    await t.svc.idle();
    t.failNext(true);
    const r = await t.svc.getWrapped(2026, at('2026-03-11T08:00:00Z'));
    expect(r.kind).toBe('ok');
    await t.svc.idle();
    const r2 = await t.svc.getWrapped(2026, at('2026-03-11T08:00:00Z'));
    expect(r2.kind).toBe('ok');
  });

  test('a final year is built once and never rebuilt', async () => {
    const t = setup();
    expect((await t.svc.getWrapped(2025, now)).kind).toBe('building');
    await t.svc.idle();
    const r = await t.svc.getWrapped(2025, at('2026-09-01T00:00:00Z'));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.report.final).toBe(true);
    await t.svc.idle();
    expect(t.builds).toHaveLength(1);
  });

  test('a year-to-date entry is rebuilt as final once the year has ended', async () => {
    const t = setup();
    const dec = at('2025-12-30T10:00:00Z');
    await t.svc.getWrapped(2025, dec);
    await t.svc.idle();
    const r = await t.svc.getWrapped(2025, at('2026-01-01T00:30:00Z'));
    expect(r.kind).toBe('ok'); // stale YTD report meanwhile
    await t.svc.idle();
    expect(t.builds).toHaveLength(2);
    expect(t.builds[1]!.final).toBe(true);
  });

  test('invalidate makes even a final year rebuild, serving the old report meanwhile', async () => {
    const t = setup();
    await t.svc.getWrapped(2025, now);
    await t.svc.idle();
    t.svc.invalidate();
    expect((await t.svc.getWrapped(2025, now)).kind).toBe('ok');
    await t.svc.idle();
    expect(t.builds).toHaveLength(2);
    await t.svc.getWrapped(2025, now);
    await t.svc.idle();
    expect(t.builds).toHaveLength(2);
  });

  test('a build that started before invalidate lands stale and rebuilds', async () => {
    const t = setup();
    t.hold();
    await t.svc.getWrapped(2025, now);
    t.svc.invalidate();
    t.open();
    await t.svc.idle();
    expect((await t.svc.getWrapped(2025, now)).kind).toBe('ok');
    await t.svc.idle();
    expect(t.builds).toHaveLength(2);
  });
});

describe('shiftYears', () => {
    test('moves the same UTC instant by whole years', () => {
        expect(shiftYears(new Date('2026-11-02T19:30:00Z'), -1).toISOString()).toBe('2025-11-02T19:30:00.000Z');
        expect(shiftYears(new Date('2027-01-01T00:00:00Z'), -1).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
    test('29 February rolls onto 1 March', () => {
        expect(shiftYears(new Date('2028-02-29T00:00:00Z'), -1).toISOString()).toBe('2027-03-01T00:00:00.000Z');
    });
});
