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
    pickAggregateSource,
    playerFilterSql,
} from './aggregateTiers.js';
import { gameIdentitiesOnly } from './identitySql.js';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Scope narrows which rows of server_stats are considered.
 * - 'global'  → every identity
 * - 'network' → the identities of one server_group_id
 * - 'server'  → a single identity, i.e. one canonical server id
 *
 * Every id crossing this boundary is canonical (migration 29); the raw stream
 * ids only exist inside the queries below, between the source scan and the
 * server_canonical join that collapses them.
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
 * WHERE fragment (against the source alias `src`) and replacements for a scope.
 *
 * The multi-server scopes select streams by the *identity* they belong to
 * rather than by the stream's own columns: after an address change the group a
 * server belongs to is the one its live stream carries, which is exactly what
 * server_identity resolves.
 */
function scopeFilter(scope: Scope): { sql: string | null; params: Record<string, unknown> } {
    switch (scope.kind) {
        case 'global':
            return { sql: null, params: {} };
        case 'server':
            return {
                sql: 'src.server_id IN (SELECT server_family(:serverId))',
                params: { serverId: scope.serverId }
            };
        case 'network':
            return {
                sql: `src.server_id IN (
                  SELECT group_family.server_id
                  FROM server_canonical group_family
                  JOIN server_identity gsi ON gsi.id = group_family.canonical_id
                  WHERE gsi.server_group_id = :groupId
              )`,
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
 * Three aggregation steps, in this order, and the order is the whole point
 * (migration 29):
 *
 *   1. MAX per raw server_id per bucket.  A single stream contributes several
 *      rows to one bucket — one per poll on the raw hypertable, and one per map
 *      on the map-keyed aggregates — and the peak is the number the chart wants.
 *   2. MAX per canonical id.  The two streams of a migrating server overlap for
 *      as long as the old address keeps answering, so summing them would invent
 *      players that were never online; MAX is also what get_server_details()
 *      does, so the peak on the page and the peak on the graph agree.
 *   3. SUM across identities.  This is what makes the global and network charts
 *      a player *total*.  (They used to take a plain MAX over every server at
 *      once, i.e. plot the single busiest server per bucket, which contradicted
 *      both the label on the chart and every other total on the site.)
 *
 * The single-server scope reaches step 3 with exactly one identity in the
 * window, so the same builder serves all three scopes and the SUM is over one
 * group there.
 *
 * Gapfill deliberately sits at step 3 and not at step 2: gapfilling per
 * identity would materialise buckets × servers rows — hundreds of thousands for
 * a 12-month global chart — only to sum them straight back down to one row per
 * bucket.  Steps 1 and 2 therefore bucket with plain time_bucket, and the
 * gapfill runs once over the already-bucketed column.
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
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        scopeSql,
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    // Only the aggregate scopes drop hubs and test servers; a non-'game' server
    // stays reachable on its own detail page, and that page's chart is the
    // single-server scope.
    const collapseConditions = scope.kind === 'server'
        ? null
        : gameIdentitiesOnly('sc.canonical_id');

    const query = `
        SELECT extract(epoch FROM g.gf_bucket) * 1000 AS timestamp,
               g.players
        FROM (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           cs.bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   -- Gaps are NULL and SUM skips them, so a bucket only comes
                   -- back NULL when nothing in scope reported at all -- which is
                   -- the gap the chart wants to draw.
                   SUM(cs.players) AS players
            FROM (
                -- Step 2: collapse each identity's aliases.  MAX, never SUM:
                -- the old and the new address of a migrating server both answer
                -- for a while, and they are reporting the same players.
                SELECT ps.bucket,
                       sc.canonical_id,
                       MAX(ps.players) AS players
                FROM (
                    -- Step 1: peak per raw stream, so several rows for one
                    -- stream in one bucket cannot be counted twice downstream.
                    SELECT time_bucket(:bucketSeconds * INTERVAL '1 second', src.${time}) AS bucket,
                           src.server_id,
                           MAX(src.${source.playersColumn}) AS players
                    FROM ${source.table} src
                    WHERE ${conditions.join('\n                      AND ')}
                    GROUP BY 1, 2
                ) ps
                JOIN server_canonical sc ON sc.server_id = ps.server_id
                ${collapseConditions ? `WHERE ${collapseConditions}` : ''}
                GROUP BY ps.bucket, sc.canonical_id
            ) cs
            -- Redundant against the scan bounds above for whole buckets, but
            -- time_bucket() can pull a row's bucket back before rangeStart, and
            -- gapfill rejects rows outside the range it was given.
            WHERE cs.bucket >= ${rangeStart}
              AND cs.bucket < ${rangeEnd}
            -- Aliased away from the subquery's own bucket column: an
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
 * Player history for a single server identity.
 * `serverId` is a canonical id; the whole family's streams are read and
 * collapsed, so a chart does not truncate at an address change.
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
    // SUM() over an integer column is a bigint, which pg hands back as a string.
    return rows.map(r => ({ timestamp: Number(r.timestamp), players: r.players == null ? null : Number(r.players) }));
}

/**
 * Summed player history across every 'game' identity (global view).
 *
 * A true total: each identity contributes its own peak for the bucket and those
 * peaks are summed.  This used to return the busiest single server per bucket,
 * so the numbers this endpoint reports are higher than they were.
 */
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

/**
 * Summed player history for the 'game' identities of one network (server group).
 * Same correction as the global view: a real sum across servers rather than the
 * busiest one.
 */
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
