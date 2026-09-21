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
    COARSE_OF,
    PLAYER_FILTER_REPLACEMENTS,
    fineBucketExpr,
    pickAggregateSource,
    playerFilterSql,
    rangeBounds,
} from './aggregateTiers.js';
import {
    aggregateExcludeSql,
    canonicalJoin,
    familyMembersSql,
    serverFamilySql,
} from './canonicalIdentity.js';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Scope narrows which rows server_stats are considered.
 * - 'global'  → all servers
 * - 'server'  → one canonical server (every observation row in its family)
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

/**
 * WHERE fragment and replacements for a given scope, against the source aliased
 * as `src`.
 *
 * Every scope selects RAW server_ids: stats are written against the observation
 * row that produced them and stay that way, so the scope resolves families down
 * to their members here and the query collapses them back onto the canonical id
 * afterwards.  That is what keeps a merge free of any aggregate invalidation.
 *
 * The single-server scope deliberately does not apply the aggregate_exclude
 * filter — excluding a hub server from global totals is not a reason to refuse
 * to draw its own chart.
 */
function scopeFilter(scope: Scope): { sql: string; params: Record<string, unknown> } {
    switch (scope.kind) {
        case 'global':
            return { sql: aggregateExcludeSql('src'), params: {} };
        case 'server':
            return {
                sql: `src.server_id IN (${serverFamilySql(':serverId')})`,
                params: { serverId: scope.serverId }
            };
        case 'network':
            return {
                sql: `src.server_id IN (${familyMembersSql(
                    'root.server_group_id = :groupId AND NOT root.aggregate_exclude'
                )})`,
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
 * ── Why three aggregation steps rather than one MAX ─────────────────────────
 * Each step exists for a different reason, and the order between them is what
 * makes the number honest:
 *
 *   1. per_canonical  — peak per (instant, canonical server).  The MAX both
 *      does the existing per-server dedup and collapses the aliases of a merged
 *      server together.  Aliases are MAX'd, never summed: for the days either
 *      side of an IP change both addresses answer, and summing them would
 *      report one server's players twice.
 *   2. per_instant    — total across servers at one instant.  Rows summed here
 *      describe the same moment, which is what makes the sum mean anything.
 *   3. peak_instant   — the busiest single instant inside each coarse bucket.
 *      Taking each server's maximum over a whole bucket and then summing would
 *      add up maxima that never coexisted, and the wider the bucket the worse
 *      it gets; picking one instant reports concurrency that actually happened.
 *
 * This is the same shape buildGamemodeHistoryQuery uses, deliberately: the
 * global line here and the stacked gamemode chart are meant to reconcile.
 *
 * For the single-server scope the middle step sums one row and the last picks
 * the busiest instant in the bucket, which is exactly max(max(players)) — the
 * scope costs nothing extra and needs no separate query shape.
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
    const fine = fineBucketExpr(source, 'src');
    const { rangeStart, rangeEnd } = rangeBounds(startDate, endDate);

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const conditions = [
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        scopeSql,
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    const query = `
        WITH per_canonical AS (
            SELECT ${fine} AS fine_bucket,
                   sc.canonical_id,
                   MAX(src.${source.playersColumn}) AS players
            FROM ${source.table} src
                     ${canonicalJoin('sc', 'src')}
            WHERE ${conditions.join('\n              AND ')}
            GROUP BY 1, 2
        ),
        per_instant AS (
            SELECT fine_bucket, SUM(players) AS players
            FROM per_canonical
            GROUP BY 1
        ),
        peak_instant AS (
            SELECT DISTINCT ON (${COARSE_OF('t.fine_bucket')}) t.fine_bucket, t.players
            FROM per_instant t
            ORDER BY ${COARSE_OF('t.fine_bucket')}, t.players DESC, t.fine_bucket
        )
        SELECT extract(epoch FROM g.gf_bucket) * 1000 AS timestamp,
               g.players
        FROM (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           pk.fine_bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   -- Exactly one instant survives per coarse bucket, so this MAX
                   -- passes the value through; it is here to satisfy the gapfill
                   -- grouping, not to combine anything.
                   MAX(pk.players) AS players
            FROM peak_instant pk
            -- Aliased away from the source's own bucket column: an unqualified
            -- GROUP BY name binds to the input column, which would silently
            -- group at the source's resolution instead of the requested one.
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

/** SUM() comes back as a bigint, which pg hands over as a string. */
function toPlayers(value: number | null): number | null {
    return value == null ? null : Number(value);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Player history for one server, addressed by its canonical id.
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
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: toPlayers(r.players) }));
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
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: toPlayers(r.players) }));
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
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: toPlayers(r.players) }));
}
