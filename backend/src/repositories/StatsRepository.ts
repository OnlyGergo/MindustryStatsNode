// ─────────────────────────────────────────────────────────────────────────────
// statsRepository.ts
// Player-count history queries.  These read from the continuous aggregates
// built in migration 21 (falling back to raw server_stats only for windows
// finer than the base aggregate).
// These are the TimescaleDB-heavy queries; keep raw SQL here intentionally.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { type ServerHistory } from '../../../common/models/serverData.js';
import { QueryTypes } from 'sequelize';
import {
    PLAYER_FILTER_REPLACEMENTS,
    aggregateExcludeSql,
    pickAggregateSource,
    playerFilterSql,
} from './aggregateTiers.js';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Scope narrows which rows server_stats are considered.
 * - 'global'  → all servers
 * - 'server'  → single server_id
 * - 'network' → all servers belonging to a server_group_id
 */
type Scope =
    | { kind: 'global' }
    | { kind: 'server';  serverId: number }
    | { kind: 'network'; groupId: number };

interface RawHistoryRow {
    timestamp: number;
    players: number | null;
}

/** WHERE fragment and replacements for a given scope. */
function scopeFilter(scope: Scope): { sql: string | null; params: Record<string, unknown> } {
    switch (scope.kind) {
        case 'global':
            return { sql: aggregateExcludeSql(), params: {} };
        case 'server':
            return {
                sql: 'server_id = :serverId',
                params: { serverId: scope.serverId }
            };
        case 'network':
            return {
                sql: 'server_id IN (SELECT id FROM servers WHERE server_group_id = :groupId AND NOT aggregate_exclude)',
                params: { groupId: scope.groupId }
            };
    }
}

/**
 * Builds the full SQL for a bucketed history query.
 *
 * Reads from the coarsest continuous aggregate that can serve the requested
 * bucket width (see aggregateTiers.ts) rather than from the raw hypertable, so
 * a long range never has to decompress millions of raw rows to produce a few
 * hundred points.  Only sub-5-minute widths still touch server_stats directly,
 * and those windows are only a few hours wide.
 *
 * Gaps are filled by time_bucket_gapfill instead of a generate_series CTE plus
 * LEFT JOIN: one pass, no materialised series to hash-join against.
 *
 * Taking MAX() of an already-max'd column is exact, so for the multi-server
 * scopes the per-server step the old query did is folded into the same
 * aggregation — max(max(x)) is max(x).
 */
function buildHistoryQuery(
    scope: Scope,
    bucketMinutes: number,
    hoursBack: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const source = pickAggregateSource(bucketMinutes);
    const { sql: scopeSql, params: scopeParams } = scopeFilter(scope);
    const time = source.timeColumn;

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    // ── Range bounds ─────────────────────────────────────────────────────────
    // The end bound is exclusive but pushed out by one bucket, so the bucket
    // that is currently filling up is still returned — matching the inclusive
    // generate_series this replaced.
    const fixedWindow = startDate != null && endDate != null;

    const rangeStart =
        fixedWindow
            ? "time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:startDate / 1000.0))"
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)";

    const rangeEnd =
        fixedWindow
            ? "(time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:endDate / 1000.0)) + :bucketSeconds * INTERVAL '1 second')"
            : "(time_bucket(:bucketSeconds * INTERVAL '1 second', NOW()) + :bucketSeconds * INTERVAL '1 second')";

    const conditions = [
        `${time} >= ${rangeStart}`,
        `${time} < ${rangeEnd}`,
        scopeSql,
        playerFilterSql(source),
    ].filter((c): c is string => c != null);

    const query = `
        SELECT extract(epoch FROM g.gf_bucket) * 1000 AS timestamp,
               g.players
        FROM (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           ${time},
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   MAX(${source.playersColumn}) AS players
            FROM ${source.table}
            WHERE ${conditions.join('\n              AND ')}
            -- Aliased away from the source's own bucket column: an
            -- unqualified GROUP BY name binds to the input column, which would
            -- silently group at the source's resolution instead of the
            -- requested one.
            GROUP BY gf_bucket
        ) g
        ORDER BY g.gf_bucket
    `;

    return {
        query,
        replacements: {
            ...scopeParams,
            ...timeParams,
            ...PLAYER_FILTER_REPLACEMENTS,
            bucketSeconds: source.bucketMinutes * 60,
        }
    };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Player history for a single server.
 * Pass startDate/endDate (ms epoch) for a fixed window, or hoursBack for a
 * rolling window.  bucketMinutes is snapped up to the nearest width an
 * aggregate can serve.
 */
export async function getAggregatedHistory(
    serverId: number,
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<ServerHistory[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1
    }

    const { query, replacements } = buildHistoryQuery(
        { kind: 'server', serverId },
        bucketMinutes,
        hoursBack,
        startDate,
        endDate
    );
    const rows = await sequelize.query(query, {replacements, type: QueryTypes.SELECT}) as RawHistoryRow[];
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: r.players }));
}

/** Summed player history across every server (global view). */
export async function getGlobalPlayerHistory(
    hoursBack: number = 24,
    bucketMinutes: number = 1
): Promise<ServerHistory[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1
    }

    const { query, replacements } = buildHistoryQuery(
        { kind: 'global' },
        bucketMinutes,
        hoursBack
    );
    const rows = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as RawHistoryRow[];
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: r.players == null ? null : Number(r.players) }));
}

/** Summed player history for all servers within a network (server group). */
export async function getNetworkPlayerHistory(
    groupId: number,
    hoursBack: number = 24,
    bucketMinutes: number = 1
): Promise<ServerHistory[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1
    }

    const { query, replacements } = buildHistoryQuery(
        { kind: 'network', groupId },
        bucketMinutes,
        hoursBack
    );
    const rows = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as RawHistoryRow[];
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: r.players == null ? null : Number(r.players) }));
}
