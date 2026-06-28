// ─────────────────────────────────────────────────────────────────────────────
// statsRepository.ts
// Player-count history and aggregation queries against server_stats.
// These are the TimescaleDB-heavy queries; keep raw SQL here intentionally.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { ServerHistory } from '../../../common/models/serverData.js';
import { QueryTypes } from 'sequelize';

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
function scopeFilter(scope: Scope): { sql: string; params: Record<string, unknown> } {
    switch (scope.kind) {
        case 'global':
            return { sql: 'players >= 0 AND players < 100', params: {} };
        case 'server':
            return {
                sql: 'server_id = :serverId AND players >= 0 AND players < 100',
                params: { serverId: scope.serverId }
            };
        case 'network':
            return {
                sql: 'server_id IN (SELECT id FROM servers WHERE server_group_id = :groupId) AND players >= 0 AND players < 100',
                params: { groupId: scope.groupId }
            };
    }
}

/**
 * Builds the full SQL for a bucketed or raw history query.
 *
 * When bucketSeconds === 0 each raw row is returned as-is (one players value
 * per timestamp).
 *
 * For global/network scopes the query first takes MAX(players) per server per
 * bucket, then SUMs across servers — which correctly preserves peaks.
 */
function buildHistoryQuery(
    scope: Scope,
    bucketSeconds: number,
    hoursBack: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const { sql: scopeSql, params: scopeParams } = scopeFilter(scope);
    const multiServer = scope.kind !== 'server';

    // ── Time-range fragment ──────────────────────────────────────────────────
    const timeFilter =
        startDate != null && endDate != null
            ? 'timestamp >= to_timestamp(:startDate / 1000.0) AND timestamp <= to_timestamp(:endDate / 1000.0)'
            : "timestamp > NOW() - interval '1 hour' * :hoursBack";

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const replacements = { ...scopeParams, ...timeParams };

    // ── Bucketed ─────────────────────────────────────────────────────────────
    const rangeStart =
        startDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:startDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)";

    const rangeEnd =
        endDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:endDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW())";

    const aggregation = multiServer
        ? `
            server_max AS (
                SELECT bucket, server_id, MAX(players) AS max_players
                FROM bucketed
                GROUP BY bucket, server_id
            ),
            aggregated AS (
                SELECT bucket, MAX(max_players) AS players
                FROM server_max
                GROUP BY bucket
            )`
        : `
            aggregated AS (
                SELECT bucket, MAX(players) AS players
                FROM bucketed
                GROUP BY bucket
            )`;

    const query = `
        WITH time_range AS (
            SELECT ${rangeStart} AS range_start,
                   ${rangeEnd}   AS range_end
        ),
        all_buckets AS (
            SELECT generate_series(
                (SELECT range_start FROM time_range),
                (SELECT range_end   FROM time_range),
                :bucketSeconds * INTERVAL '1 second'
            ) AS bucket
        ),
        bucketed AS (
            SELECT ${multiServer ? 'server_id, ' : ''}
                       time_bucket(:bucketSeconds * INTERVAL '1 second', timestamp) AS bucket,
                   players
            FROM server_stats
            WHERE ${scopeSql} AND ${timeFilter}
        ),
        ${aggregation}
        SELECT extract(epoch FROM all_buckets.bucket) * 1000 AS timestamp,
               aggregated.players
        FROM all_buckets
        LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket
        ORDER BY all_buckets.bucket
    `;

    return { query, replacements: { ...replacements, bucketSeconds } };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Player history for a single server.
 * Pass startDate/endDate (ms epoch) for a fixed window, or hoursBack for a
 * rolling window.  bucketMinutes=0 returns raw rows.
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
        bucketMinutes * 60,
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
        bucketMinutes * 60,
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
        bucketMinutes * 60,
        hoursBack
    );
    const rows = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as RawHistoryRow[];
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: r.players == null ? null : Number(r.players) }));
}