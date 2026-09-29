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
    const start = Math.max(startDate, endDate - MAX_WINDOW_HOURS * HOUR_MS);
    const hoursBack = Math.ceil((endDate - start) / HOUR_MS);
    const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));
    return { hoursBack, bucketMinutes, startDate: start, endDate };
  }

  const hoursBack = (range && HOURS_BACK[range]) || 24;
  const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));
  return { hoursBack, bucketMinutes };
}
