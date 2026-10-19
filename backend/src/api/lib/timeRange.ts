import { apiConfig } from '../context.js';

const HOURS_BACK: Record<string, number> = {
  '7d': 168,
  '14d': 336,
  '3m': 2190,
  '12m': 8760,
};

const HOUR_MS = 1000 * 60 * 60;

/**
 * Widest custom window accepted, a little over the 12m preset. Anything wider is
 * clamped so the chart queries (and their gapfill) stay bounded.
 */
const MAX_WINDOW_HOURS = 24 * 400;

/** Custom windows may not end further than this past now (clock skew slack). */
const MAX_FUTURE_MS = 24 * HOUR_MS;

/** Parses a numeric query string param, returning undefined for empty/invalid input. */
export function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export interface ResolvedRange {
  hoursBack: number;
  bucketMinutes: number;
  /** Set (both or neither) only when a valid custom window was supplied. */
  startDate?: number;
  endDate?: number;
}

/**
 * Resolves a `range` shorthand (or an explicit startDate/endDate window) into
 * hoursBack + bucketMinutes, sized against GRAPH_MAX_POINTS.
 *
 * A custom window is only honoured when both ends are present, ordered, and
 * inside [0, now + 1 day]; it is then clamped to MAX_WINDOW_HOURS by pulling
 * the start forward. An invalid window falls back to `range`, and the returned
 * startDate/endDate are what callers must pass on to the repositories, so the
 * window and the bucket width always agree.
 */
export function resolveRange(range?: string, startDate?: number, endDate?: number): ResolvedRange {
  const maxEnd = Date.now() + MAX_FUTURE_MS;

  if (
    startDate != null && endDate != null &&
    startDate >= 0 && endDate > startDate && endDate <= maxEnd
  ) {
    const clampedStart = Math.max(startDate, endDate - MAX_WINDOW_HOURS * HOUR_MS);
    const hoursBack = Math.ceil((endDate - clampedStart) / HOUR_MS);
    const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));

    // Snap both ends down to the bucket width. Without this every distinct millisecond
    // value is a distinct cache key, so a client can defeat the response cache (and flood
    // the DB) just by nudging startDate/endDate. Snapped, a window can only land on one
    // of a bounded set of keys, and the bucket grid is what the data is cut on anyway.
    const bucketMs = bucketMinutes * 60_000;
    const start = Math.floor(clampedStart / bucketMs) * bucketMs;
    const end = Math.floor(endDate / bucketMs) * bucketMs;
    if (end > start) return { hoursBack, bucketMinutes, startDate: start, endDate: end };
    // Window narrower than one bucket: fall through to the preset default below.
  }

  const hoursBack = (range && HOURS_BACK[range]) || 24;
  const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));
  return { hoursBack, bucketMinutes };
}

/**
 * Canonical cache-key fragment for a resolved range. Built from the *resolved* window,
 * never the raw query, so `range=bogus`, `range=`, no range, and a half-supplied custom
 * window (which resolveRange ignores) all share the one entry they actually produce.
 */
export function rangeKey(range?: string, startDate?: string, endDate?: string): string {
  const r = resolveRange(range, parseTimestamp(startDate), parseTimestamp(endDate));
  return r.startDate != null ? `${r.startDate}-${r.endDate}` : `${r.hoursBack}h`;
}
