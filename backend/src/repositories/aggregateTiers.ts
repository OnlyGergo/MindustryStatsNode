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

export function aggregateExcludeSql(alias?: string): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}server_id IN (SELECT id FROM servers WHERE NOT aggregate_exclude)`;
}
