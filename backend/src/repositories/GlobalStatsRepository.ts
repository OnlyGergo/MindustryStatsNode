import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type GamemodeHistoryEntry, type GamemodeInfo, type ServerShareEntry } from '../../../common/models/GlobalStatsTypes.js';
import {
    PLAYER_FILTER_REPLACEMENTS,
    aggregateExcludeSql,
    pickAggregateSource,
    playerFilterSql,
} from './aggregateTiers.js';

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
        aggregateExcludeSql('src'),
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
                           ps.bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   ps.gamemode_id,
                   SUM(ps.players) AS players
            FROM (
                -- Peak per server first, so summing across servers cannot
                -- double count a server that changed map mid-bucket.
                SELECT time_bucket(:bucketSeconds * INTERVAL '1 second', src.${time}) AS bucket,
                       src.server_id,
                       smr.gamemode_id,
                       MAX(src.${source.playersColumn}) AS players
                FROM ${source.mapTable} src
                         JOIN server_maps_registry smr ON src.map_registry_id = smr.id
                WHERE ${conditions.join('\n                  AND ')}
                GROUP BY 1, 2, 3
            ) ps
            WHERE ps.bucket >= ${rangeStart}
              AND ps.bucket < ${rangeEnd}
            -- Aliased away from the subquery's own bucket column: an
            -- unqualified GROUP BY name binds to the input column.
            GROUP BY gf_bucket, ps.gamemode_id
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
        WITH bucketed_stats AS (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           src.${time},
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   src.server_id,
                   MAX(src.${source.playersColumn}) AS players -- gaps stay NULL
            FROM ${source.mapTable} src
                     JOIN server_maps_registry smr ON src.map_registry_id = smr.id
            WHERE ${conditions.join('\n              AND ')}
            -- Aliased away from the source's own bucket column: an
            -- unqualified GROUP BY name binds to the input column, which would
            -- silently group at the source's resolution instead of the
            -- requested one.
            GROUP BY gf_bucket, src.server_id
        )
        SELECT
            extract(epoch FROM bs.gf_bucket) * 1000 AS timestamp,
            bs.server_id,
            s.server_group_id,
            '' AS server_name,
            sg.name AS group_name,
            bs.players
        FROM bucketed_stats bs
                 -- Join the metadata AFTER the heavy lifting is done
                 JOIN servers s ON bs.server_id = s.id
                 JOIN server_groups sg ON s.server_group_id = sg.id
        ORDER BY bs.gf_bucket, bs.server_id;
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
    const query = `
      SELECT MIN(gr.id) AS id,
        gr.clean_name,
        COUNT(DISTINCT smh.server_id) AS server_count
      FROM gamemode_registry gr
        JOIN server_maps_registry smr ON smr.gamemode_id = gr.id
        JOIN server_maps_history smh ON smh.map_id = smr.id
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
