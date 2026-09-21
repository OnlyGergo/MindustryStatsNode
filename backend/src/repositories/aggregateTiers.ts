// ─────────────────────────────────────────────────────────────────────────────
// aggregateTiers.ts
// Maps a requested bucket width onto the continuous aggregate that can serve it.
//
// Callers derive bucket widths from GRAPH_MAX_POINTS, which produces arbitrary
// values (1752 minutes for a 12-month chart, say).  An arbitrary width cannot be
// served from a 5-minute or 1-hour aggregate, so it gets snapped up to the next
// tier.  Re-bucketing an aggregate is exact as long as the requested width is an
// integer multiple of the source width and the aggregate is decomposable —
// max(max_players) is, which is what every chart query takes.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_REALISTIC_PLAYERCOUNT } from '../const.js';

/** Everything a query builder needs to read from the chosen relation. */
export interface AggregateSource {
    /** Bucket width the query should actually use, in minutes. */
    bucketMinutes: number;
    /** Relation to read when the query does not need the map dimension. */
    table: string;
    /** Relation to read when the query groups by map_registry_id. */
    mapTable: string;
    /** Name of the time column on those relations. */
    timeColumn: string;
    /** Player-count column to aggregate. */
    playersColumn: string;
    /**
     * True only for the raw hypertable.  The aggregates bake the players sanity
     * filter in at materialisation time; raw reads still have to apply it.
     */
    needsPlayerFilter: boolean;
}

const TIERS = [
    { minutes:    5, table: 'server_stats_5m', mapTable: 'server_stats_5m' },
    { minutes:   10, table: 'server_stats_5m', mapTable: 'server_stats_5m' },
    { minutes:   15, table: 'server_stats_5m', mapTable: 'server_stats_5m' },
    { minutes:   30, table: 'server_stats_5m', mapTable: 'server_stats_5m' },
    { minutes:   60, table: 'server_stats_1h', mapTable: 'server_stats_1h_by_map' },
    { minutes:  180, table: 'server_stats_1h', mapTable: 'server_stats_1h_by_map' },
    { minutes:  360, table: 'server_stats_1h', mapTable: 'server_stats_1h_by_map' },
    { minutes:  720, table: 'server_stats_1h', mapTable: 'server_stats_1h_by_map' },
    { minutes: 1440, table: 'server_stats_1h', mapTable: 'server_stats_1h_by_map' },
] as const;

/** Width below which the aggregates cannot help and raw rows are read instead. */
const FINEST_AGGREGATE_MINUTES = TIERS[0].minutes;

/** Fallback for anything coarser than the widest tier. */
const COARSEST_TIER = TIERS[TIERS.length - 1]!;

/**
 * Picks the relation that can serve a bucket width.
 *
 * Anything finer than the base aggregate (only reachable from short custom
 * ranges, since a 24-hour chart already asks for ~9 minutes) keeps reading the
 * raw hypertable at the exact requested width: those windows are a few hours
 * wide, so the scan stays bounded and the live view keeps its full resolution.
 */
export function pickAggregateSource(requestedMinutes: number): AggregateSource {
    const requested = Math.max(1, Math.round(requestedMinutes));

    if (requested < FINEST_AGGREGATE_MINUTES) {
        return {
            bucketMinutes:     requested,
            table:             'server_stats',
            mapTable:          'server_stats',
            timeColumn:        'timestamp',
            playersColumn:     'players',
            needsPlayerFilter: true,
        };
    }

    const tier = TIERS.find(t => t.minutes >= requested) ?? COARSEST_TIER;

    return {
        bucketMinutes:     tier.minutes,
        table:             tier.table,
        mapTable:          tier.mapTable,
        timeColumn:        'bucket',
        playersColumn:     'max_players',
        needsPlayerFilter: false,
    };
}

/** SQL fragment for the players sanity filter, or null when it is already baked in. */
export function playerFilterSql(source: AggregateSource, alias?: string): string | null {
    if (!source.needsPlayerFilter) return null;
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}players >= 0 AND ${prefix}players < :maxRealisticPlayerCount`;
}

export const PLAYER_FILTER_REPLACEMENTS = {
    maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT,
};

// ─── Shared bucket maths ─────────────────────────────────────────────────────
// Both chart repositories build the same three expressions out of a chosen
// source, so they live here with the source they describe rather than being
// written twice.

/**
 * Range bounds for a query window.
 *
 * The end bound is exclusive but pushed out by one bucket so the bucket that is
 * currently filling up is still returned.
 */
export function rangeBounds(startDate?: number, endDate?: number): { rangeStart: string; rangeEnd: string } {
    const fixedWindow = startDate != null && endDate != null;

    return {
        rangeStart: fixedWindow
            ? "time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:startDate / 1000.0))"
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)",
        rangeEnd: fixedWindow
            ? "(time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:endDate / 1000.0)) + :bucketSeconds * INTERVAL '1 second')"
            : "(time_bucket(:bucketSeconds * INTERVAL '1 second', NOW()) + :bucketSeconds * INTERVAL '1 second')",
    };
}

/**
 * Expression for the "instant" a cross-server total is summed over.
 *
 * Summing player counts only means anything if the rows being summed describe
 * the same moment.  The continuous aggregates already come pre-bucketed, so
 * their own bucket column is the finest honest instant available.  The raw
 * hypertable does not: every server is polled on its own schedule, so summing
 * by raw timestamp would put roughly one server in each "instant".  On that
 * path the rows get bucketed to the requested width first -- which on the raw
 * path is also the coarse width, so the peak-instant step collapses to an
 * identity and full resolution is preserved.
 */
export function fineBucketExpr(source: AggregateSource, alias: string): string {
    return source.needsPlayerFilter
        ? `time_bucket(:bucketSeconds * INTERVAL '1 second', ${alias}.${source.timeColumn})`
        : `${alias}.${source.timeColumn}`;
}

/** The coarse bucket a fine instant belongs to. */
export const COARSE_OF = (col: string) => `time_bucket(:bucketSeconds * INTERVAL '1 second', ${col})`;
