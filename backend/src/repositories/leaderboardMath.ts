// Pure ranking/delta helpers for the leaderboard. The SQL returns one row per
// family (or map) with current and previous window player-hours; everything
// that orders, ranks or compares them lives here so it can be unit tested.

export interface Scored<K> {
    key: K;
    cur: number;
    prev: number;
}

export interface Ranked<K> extends Scored<K> {
    rank: number;
    /** null = not in the previous window's top `PREV_RANK_LIMIT`. */
    prevRank: number | null;
}

/** A previous rank beyond this is reported as NEW (null). */
export const PREV_RANK_LIMIT = 100;

export const round1 = (n: number): number => Math.round(n * 10) / 10;

const keyCompare = (a: unknown, b: unknown): number =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

/** 1-based positions in the previous window; entries with prev <= 0 or beyond `limit` are absent. */
export function previousRanks<K>(entries: Scored<K>[], limit: number = PREV_RANK_LIMIT): Map<K, number> {
    const sorted = entries
        .filter((e) => e.prev > 0)
        .sort((a, b) => b.prev - a.prev || keyCompare(a.key, b.key));
    const ranks = new Map<K, number>();
    for (let i = 0; i < sorted.length && i < limit; i++) ranks.set(sorted[i]!.key, i + 1);
    return ranks;
}

/** Top `limit` entries by current value (cur > 0), each with its rank and previous rank. */
export function rankTop<K>(entries: Scored<K>[], limit: number, prevLimit: number = PREV_RANK_LIMIT): Ranked<K>[] {
    const prevRanks = previousRanks(entries, prevLimit);
    return entries
        .filter((e) => e.cur > 0)
        .sort((a, b) => b.cur - a.cur || keyCompare(a.key, b.key))
        .slice(0, limit)
        .map((e, i) => ({ ...e, rank: i + 1, prevRank: prevRanks.get(e.key) ?? null }));
}

export function deltaOf(cur: number, prev: number): { delta: number; deltaPct: number | null } {
    const delta = cur - prev;
    return { delta, deltaPct: prev > 0 ? delta / prev : null };
}

/**
 * Biggest risers (`up`, delta > 0) or fallers (`down`, delta < 0). Entries
 * where both windows sit under the noise floor are ignored so a 0.2 -> 0.9
 * blip cannot top the list.
 */
export function pickMovers<K>(
    entries: Scored<K>[],
    floor: number,
    limit: number,
    direction: 'up' | 'down',
): (Scored<K> & { delta: number; deltaPct: number | null })[] {
    const sign = direction === 'up' ? 1 : -1;
    return entries
        .filter((e) => Math.max(e.cur, e.prev) >= floor)
        .map((e) => ({ ...e, ...deltaOf(e.cur, e.prev) }))
        .filter((e) => e.delta * sign > 0)
        .sort((a, b) => (b.delta - a.delta) * sign || keyCompare(a.key, b.key))
        .slice(0, limit);
}

/** Share of the total for each entry, 0..1; all zeros when the total is zero. */
export function shareOf(value: number, total: number): number {
    return total > 0 ? value / total : 0;
}
