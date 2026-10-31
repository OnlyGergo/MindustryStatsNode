/**
 * Shared SQL for player-hours per (family, hour, map).
 *
 * Each (server, hour) row of the by-map aggregate is weighted by its share of
 * that server's samples in the hour, so a map held for 20 of 60 minutes gets a
 * third of the hour's mean.
 *
 * `where` filters `server_stats_1h_by_map` aliased `st` and must carry the
 * time predicate (the window function partitions over the rows it keeps,
 * which is right as long as whole hours are kept).
 */

/** One CTE, `per_raw`: (server_id, bucket, map_registry_id, contribution) per raw server. */
export function rawHourMapCte(where: string): string {
    return `
            per_raw AS (
                SELECT st.server_id, st.bucket, st.map_registry_id,
                       st.sum_players::float8
                         / NULLIF(SUM(st.samples) OVER (PARTITION BY st.server_id, st.bucket), 0) AS contribution
                FROM server_stats_1h_by_map st
                WHERE ${where}
            )`;
}

/**
 * `per_raw` plus `per_family`: (canonical_id, bucket, map_registry_id,
 * contribution), aliases collapsed with MAX per registry row, never SUM.
 * Callers that group by map NAME must not sum these rows across registry ids:
 * two aliases can log one map under different registry rows, and summing them
 * counts the same players twice. Collapse by name before the MAX instead (see
 * getMapAggregates in leaderboardRepository.ts).
 */
export function familyHourMapCte(where: string): string {
    return `${rawHourMapCte(where)},
            per_family AS (
                SELECT sc.canonical_id, r.bucket, r.map_registry_id, MAX(r.contribution) AS contribution
                FROM per_raw r
                JOIN server_canonical sc ON sc.server_id = r.server_id
                WHERE r.contribution IS NOT NULL
                GROUP BY sc.canonical_id, r.bucket, r.map_registry_id
            )`;
}
