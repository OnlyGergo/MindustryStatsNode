import { apiConfig } from '../context.js';

const HOURS_BACK: Record<string, number> = {
  '7d': 168,
  '14d': 336,
  '3m': 2190,
  '12m': 8760,
};

/** Parses a numeric query string param, returning undefined for empty/invalid input. */
export function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Resolves a `range` shorthand (or an explicit startDate/endDate window) into
 * hoursBack + bucketMinutes, sized against GRAPH_MAX_POINTS.
 */
export function resolveRange(range?: string, startDate?: number, endDate?: number): { hoursBack: number; bucketMinutes: number } {
  if (startDate && endDate) {
    const hoursBack = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));
    return { hoursBack, bucketMinutes };
  }

  const hoursBack = (range && HOURS_BACK[range]) || 24;
  const bucketMinutes = Math.max(1, Math.round((hoursBack * 60) / apiConfig.GRAPH_MAX_POINTS));
  return { hoursBack, bucketMinutes };
}

/**
 * The same window as an absolute [start, end] pair in ms epoch.
 *
 * The history queries express their range in SQL (NOW() minus hoursBack, or the
 * explicit timestamps), which the annotation endpoints cannot reuse — they need
 * the bounds as values. Resolved from the identical inputs so the annotations
 * line up with the window the chart actually drew; the rolling case is off by at
 * most the bucket the chart's range is snapped to.
 */
export function resolveWindow(range?: string, startDate?: number, endDate?: number): { startMs: number; endMs: number } {
  if (startDate != null && endDate != null) {
    return { startMs: startDate, endMs: endDate };
  }

  const { hoursBack } = resolveRange(range);
  const endMs = Date.now();
  return { startMs: endMs - hoursBack * 60 * 60 * 1000, endMs };
}
