import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type GamemodeHistoryEntry, type GamemodeInfo, type ServerShareEntry } from '../../../common/models/GlobalStatsTypes.js';
import {
    PLAYER_FILTER_REPLACEMENTS,
    pickAggregateSource,
    playerFilterSql,
} from './aggregateTiers.js';
import { gameIdentitiesOnly } from './identitySql.js';

interface RawGamemodeHistoryRow {
    timestamp: number;
    clean_name: string;
    players: number | null;
}

interface RawGamemodeListRow {
    id: number;
    clean_name: string;
    server_count: number;
}

interface RawServerShareRow {
    timestamp: number;
    server_id: number;
    server_group_id: number;
    server_name: string;
    group_name: string;
    players: number | null;
}

/**
 * Range bounds shared by both builders.
 *
 * The end bound is exclusive but pushed out by one bucket so the bucket that is
 * currently filling up is still returned.
 */
function rangeBounds(startDate?: number, endDate?: number): { rangeStart: string; rangeEnd: string } {
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
 * Builds the SQL for bucketed gamemode history query.
 * Returns player counts grouped by gamemode per time bucket.
 *
 * Reads from the map-keyed continuous aggregates (see aggregateTiers.ts); the
 * gamemode is resolved from server_maps_registry at read time, so correcting a
 * map's classification takes effect immediately instead of needing years of
 * materialised data rebuilt.
 *
 * time_bucket_gapfill fills each mode's series independently, which is what the
 * old all_buckets × all_modes cross join was emulating — empty buckets still
 * keep their gamemode instead of coming back as null rows.
 *
 * Grouping happens on gamemode_registry.id -- one smallint -- all the way
 * through bucketing and gapfill, where the row counts are large; the registry
 * is joined in once at the end, over the handful of surviving rows, and the
 * final merge happens on the cleaned display name.  The old shape grouped on
 * the raw (game_mode, mode_name) pair throughout, which both widened every hash
 * key with a text column and split one gamemode into several series whenever a
 * server dressed its mode name in different colour codes.
 *
 * Between the per-stream peak and the sum sits the identity collapse from
 * migration 29: MAX across a family, never SUM, because a migrating server's
 * old and new addresses answer at the same time and report the same players.
 * Hubs and test servers are dropped there too -- a hub mirrors the servers it
 * lists, so leaving it in would count those players twice in the mode total.
 */
function buildGamemodeHistoryQuery(
    hoursBack: number,
    bucketMinutes: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const source = pickAggregateSource(bucketMinutes);
    const time = source.timeColumn;
    const { rangeStart, rangeEnd } = rangeBounds(startDate, endDate);

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const conditions = [
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    const query = `
        SELECT extract(epoch FROM g.gf_bucket) * 1000 AS timestamp,
               gr.clean_name,
               -- Gaps are NULL and SUM skips them, so a bucket only comes back
               -- NULL when every variant of the mode was idle -- which is the
               -- gap the chart wants to draw.
               SUM(g.players) AS players
        FROM (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           cs.bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   cs.gamemode_id,
                   SUM(cs.players) AS players
            FROM (
                -- Collapse each identity's aliases before anything is summed.
                SELECT ps.bucket,
                       sc.canonical_id,
                       ps.gamemode_id,
                       MAX(ps.players) AS players
                FROM (
                    -- Peak per raw stream first, so summing across servers cannot
                    -- double count a server that changed map mid-bucket.
                    SELECT time_bucket(:bucketSeconds * INTERVAL '1 second', src.${time}) AS bucket,
                           src.server_id,
                           smr.gamemode_id,
                           MAX(src.${source.playersColumn}) AS players
                    FROM ${source.mapTable} src
                             JOIN server_maps_registry smr ON src.map_registry_id = smr.id
                    WHERE ${conditions.join('\n                      AND ')}
                    GROUP BY 1, 2, 3
                ) ps
                JOIN server_canonical sc ON sc.server_id = ps.server_id
                WHERE ${gameIdentitiesOnly('sc.canonical_id')}
                GROUP BY ps.bucket, sc.canonical_id, ps.gamemode_id
            ) cs
            WHERE cs.bucket >= ${rangeStart}
              AND cs.bucket < ${rangeEnd}
            -- Aliased away from the subquery's own bucket column: an
            -- unqualified GROUP BY name binds to the input column.
            GROUP BY gf_bucket, cs.gamemode_id
        ) g
        -- Name resolution last: one hash join against a table small enough to
        -- stay permanently resident, over the already-reduced result.  Merging
        -- on the display name here is what folds the colour-code variants of a
        -- mode back into a single series.
        JOIN gamemode_registry gr ON g.gamemode_id = gr.id
        GROUP BY g.gf_bucket, gr.clean_name
        ORDER BY g.gf_bucket, gr.clean_name
    `;

    const replacements = {
        ...timeParams,
        ...PLAYER_FILTER_REPLACEMENTS,
        bucketSeconds: source.bucketMinutes * 60,
    };
    return { query, replacements };
}

/**
 * Builds the SQL for bucketed server share query for a specific gamemode.
 * Returns player counts per server with group info.
 *
 * Same aggregate-backed shape as above; time_bucket_gapfill fills each server's
 * series, so empty buckets retain server identity instead of coming back as
 * null rows.
 *
 * modeId identifies a display name (a clean_name), not a single registry row --
 * see the gamemode filter below.  Peaking per (bucket, server) after that widened
 * filter also means a server that flipped between two variants of the same mode
 * inside one bucket counts once, exactly as it does in the history chart.
 *
 * One series per *identity*, so a server that changed address is one line on the
 * chart rather than two half-lines that cross over at the switchover.  Unlike
 * the totals queries this one has to gapfill per series -- that is the shape of
 * its output -- so the collapse happens before the gapfill and the gapfill runs
 * over the collapsed rows.
 */
function buildServerShareQuery(
    modeId: number,
    hoursBack: number,
    bucketMinutes: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const source = pickAggregateSource(bucketMinutes);
    const time = source.timeColumn;
    const { rangeStart, rangeEnd } = rangeBounds(startDate, endDate);

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const conditions = [
        // Not `= :modeInt`: the history chart merges every registry row sharing
        // a clean_name into one series, and the dropdown hands back a single
        // representative ID for that merged series, so the share query has to
        // widen it back out to the whole family.  A vanilla mode is the extreme
        // case -- (0, ''), (0, 'Survival') and (0, '[accent]Survival') are three
        // registry rows that all display as Survival -- and filtering on one of
        // them returned one variant's servers instead of the mode's.
        `smr.gamemode_id IN (
             SELECT variant.id
             FROM gamemode_registry variant
             JOIN gamemode_registry picked ON picked.id = :modeInt
             WHERE variant.clean_name = picked.clean_name
         )`,
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    const query = `
        WITH per_stream AS (
            -- Peak per raw stream per bucket; plain time_bucket, because the
            -- gapfill cannot run until the aliases have been folded together.
            SELECT time_bucket(:bucketSeconds * INTERVAL '1 second', src.${time}) AS bucket,
                   src.server_id,
                   MAX(src.${source.playersColumn}) AS players
            FROM ${source.mapTable} src
                     JOIN server_maps_registry smr ON src.map_registry_id = smr.id
            WHERE ${conditions.join('\n              AND ')}
            GROUP BY 1, 2
        ),
        collapsed AS (
            -- MAX across the family, never SUM: while a server migrates, both
            -- addresses answer and both report the same players.
            SELECT ps.bucket,
                   sc.canonical_id,
                   MAX(ps.players) AS players
            FROM per_stream ps
                     JOIN server_canonical sc ON sc.server_id = ps.server_id
            WHERE ${gameIdentitiesOnly('sc.canonical_id')}
            GROUP BY ps.bucket, sc.canonical_id
        ),
        bucketed_stats AS (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           cs.bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   cs.canonical_id,
                   -- One row per (bucket, identity) already, so this MAX only
                   -- exists to make the statement an aggregate -- which is what
                   -- gapfill requires.  Gaps stay NULL.
                   MAX(cs.players) AS players
            FROM collapsed cs
            WHERE cs.bucket >= ${rangeStart}
              AND cs.bucket < ${rangeEnd}
            -- Aliased away from the subquery's own bucket column: an
            -- unqualified GROUP BY name binds to the input column, which would
            -- silently group at the source's resolution instead of the
            -- requested one.
            GROUP BY gf_bucket, cs.canonical_id
        )
        SELECT
            extract(epoch FROM bs.gf_bucket) * 1000 AS timestamp,
            bs.canonical_id AS server_id,
            si.server_group_id,
            '' AS server_name,
            sg.name AS group_name,
            bs.players
        FROM bucketed_stats bs
                 -- Join the metadata AFTER the heavy lifting is done, and join
                 -- it on the identity: the group shown is the one the address
                 -- the server answers on today belongs to.
                 JOIN server_identity si ON si.id = bs.canonical_id
                 JOIN server_groups sg ON si.server_group_id = sg.id
        ORDER BY bs.gf_bucket, bs.canonical_id;
    `;

    const replacements = {
        ...timeParams,
        ...PLAYER_FILTER_REPLACEMENTS,
        bucketSeconds: source.bucketMinutes * 60,
        modeInt: modeId,
    };
    return { query, replacements };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get global player history grouped by mode_name
 */
export async function getGlobalGamemodeHistory(
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<GamemodeHistoryEntry[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1;
    }

    const { query, replacements } = buildGamemodeHistoryQuery(
        hoursBack,
        bucketMinutes,
        startDate,
        endDate
    );

    const rows = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as RawGamemodeHistoryRow[];

    // clean_name is stored already stripped and already backed off to the
    // vanilla name, so there is nothing left to do per row here.
    return rows.map(r => ({
        timestamp: Number(r.timestamp),
        modeName:  r.clean_name || 'Unknown',
        cleanName: r.clean_name || 'Unknown',
        players:   r.players == null ? null : Number(r.players)
    }));
}

/**
 * Get list of all gamemodes with server counts
 */
export async function getGamemodeList(): Promise<GamemodeInfo[]> {
    // One entry per display name, matching how the history chart groups its
    // series.  The old shape grouped on (clean_name, id) and then picked the
    // busiest row per name with DISTINCT ON, which both under-counted servers
    // (only the winning variant's) and handed the client an ID that stood for a
    // single registry row rather than the mode as a whole.  MIN(id) is a stable
    // representative of the family; getServerShareByGamemode expands it again.
    //
    // Counted over canonical ids, not raw server ids: a server that has changed
    // address has a map history row under each of its streams and is still one
    // server (migration 29).
    const query = `
      SELECT MIN(gr.id) AS id,
        gr.clean_name,
        COUNT(DISTINCT sc.canonical_id) AS server_count
      FROM gamemode_registry gr
        JOIN server_maps_registry smr ON smr.gamemode_id = gr.id
        JOIN server_maps_history smh ON smh.map_id = smr.id
        JOIN server_canonical sc ON sc.server_id = smh.server_id
      WHERE ${gameIdentitiesOnly('sc.canonical_id')}
      GROUP BY gr.clean_name
      ORDER BY gr.clean_name;
    `;

    const rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
    }) as RawGamemodeListRow[];

    return rows.map(r => {
      return {
            modeId: Number(r.id),
            cleanModeName: r.clean_name,
            serverCount: Number(r.server_count),
        };
    });
}

/**
 * Get server share for a specific gamemode
 */
export async function getServerShareByGamemode(
    modeId: number,
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<ServerShareEntry[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1;
    }

    const { query, replacements } = buildServerShareQuery(
        modeId,
        hoursBack,
        bucketMinutes,
        startDate,
        endDate
    );

    const rows = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as RawServerShareRow[];

    return rows.map(r => ({
        timestamp: Number(r.timestamp),
        serverId: Number(r.server_id),
        serverGroupId: Number(r.server_group_id),
        serverName: r.server_name,
        groupName: r.group_name,
        players: r.players == null ? null : Number(r.players)
    }));
}
