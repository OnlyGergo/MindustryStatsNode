import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { GamemodeHistoryEntry, GamemodeInfo, ServerShareEntry } from '../../../common/models/GlobalStatsTypes.js';
import {removeColorsFromMindustry} from "../../../common/Mindustry.js";
import { MAX_REALISTIC_PLAYERCOUNT } from '../const.js';
import {getModeName} from "../../../common/Gamemode";

interface RawGamemodeHistoryRow {
    timestamp: number;
    mode_name: string;
    players: number | null;
    game_mode: number;
}

interface RawGamemodeListRow {
    mode_name: string;
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
 * Builds the SQL for bucketed gamemode history query.
 * Returns player counts grouped by mode_name per time bucket.
 * Uses a cross-join of all_buckets × all_modes so empty buckets
 * retain their mode_name instead of coming back as null rows.
 */
function buildGamemodeHistoryQuery(
    hoursBack: number,
    bucketSeconds: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const timeFilter =
        startDate != null && endDate != null
            ? 'timestamp >= to_timestamp(:startDate / 1000.0) AND timestamp <= to_timestamp(:endDate / 1000.0)'
            : "timestamp > NOW() - interval '1 hour' * :hoursBack";

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const rangeStart =
        startDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:startDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)";

    const rangeEnd =
        endDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:endDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW())";

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
             per_server AS (
                 SELECT
                     time_bucket(:bucketSeconds * INTERVAL '1 second', ss.timestamp) AS bucket,
                     ss.server_id,
                     smr.mode_name,
                     smr.game_mode,
                     MAX(ss.players) AS players
                 FROM server_stats ss
                          JOIN server_maps_registry smr ON ss.map_registry_id = smr.id
                 WHERE ${timeFilter}
                   AND ss.players >= 0 AND ss.players < :maxRealisticPlayerCount
                 GROUP BY bucket, ss.server_id, smr.mode_name, smr.game_mode
             ),
             aggregated AS (
                 SELECT bucket, mode_name, game_mode, SUM(players) AS players
                 FROM per_server
                 GROUP BY bucket, mode_name, game_mode
             ),
             all_modes AS (
                 SELECT DISTINCT mode_name, game_mode FROM aggregated
             )
        SELECT extract(epoch FROM b.bucket) * 1000 AS timestamp,
               m.mode_name,
               m.game_mode,
               a.players
        FROM all_buckets b
                 CROSS JOIN all_modes m
                 LEFT JOIN aggregated a ON a.bucket = b.bucket
            AND a.mode_name = m.mode_name
            AND a.game_mode = m.game_mode
        ORDER BY b.bucket, m.mode_name
    `;

    const replacements = { ...timeParams, bucketSeconds, maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT };
    return { query, replacements };
}

/**
 * Builds the SQL for bucketed server share query for a specific gamemode.
 * Returns player counts per server with group info.
 * Uses a cross-join of all_buckets × all_servers so empty buckets
 * retain server identity instead of coming back as null rows.
 */
function buildServerShareQuery(
    modeName: string,
    hoursBack: number,
    bucketSeconds: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const timeFilter =
        startDate != null && endDate != null
            ? 'ss.timestamp >= to_timestamp(:startDate / 1000.0) AND ss.timestamp <= to_timestamp(:endDate / 1000.0)'
            : "ss.timestamp > NOW() - interval '1 hour' * :hoursBack";

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const rangeStart =
        startDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:startDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)";

    const rangeEnd =
        endDate != null
            ? 'time_bucket(:bucketSeconds * INTERVAL \'1 second\', to_timestamp(:endDate / 1000.0))'
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW())";

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
                 SELECT
                     time_bucket(:bucketSeconds * INTERVAL '1 second', ss.timestamp) AS bucket,
                     ss.server_id,
                     s.server_group_id,
                     '' AS server_name,
                     sg.name AS group_name,
                     MAX(ss.players) AS players
                 FROM server_stats ss
                          JOIN servers s ON ss.server_id = s.id
                          JOIN server_groups sg ON s.server_group_id = sg.id
                          JOIN server_maps_registry smr ON ss.map_registry_id = smr.id
                 WHERE smr.mode_name = :modeName AND ${timeFilter} AND ss.players >= 0 AND ss.players < :maxRealisticPlayerCount
                 GROUP BY bucket, ss.server_id, s.server_group_id, sg.name
             ),
             aggregated AS (
                 SELECT bucket, server_id, server_group_id, server_name, group_name, MAX(players) AS players
                 FROM bucketed
                 GROUP BY bucket, server_id, server_group_id, server_name, group_name
             ),
             all_servers AS (
                 SELECT DISTINCT server_id, server_group_id, server_name, group_name
                 FROM aggregated
             )
        SELECT extract(epoch FROM b.bucket) * 1000 AS timestamp,
               s.server_id,
               s.server_group_id,
               s.server_name,
               s.group_name,
               a.players
        FROM all_buckets b
                 CROSS JOIN all_servers s
                 LEFT JOIN aggregated a ON a.bucket = b.bucket AND a.server_id = s.server_id
        ORDER BY b.bucket, s.server_id
    `;

    const replacements = {
        ...timeParams,
        bucketSeconds,
        modeName,
        maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT,
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
        bucketMinutes * 60,
        startDate,
        endDate
    );

    const rows = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as RawGamemodeHistoryRow[];

    return rows.map(r => {
        const modeName = getModeName(r.mode_name, r.game_mode);
        return {
            timestamp: Number(r.timestamp),
            modeName: modeName ?? 'Unknown',
            cleanName: modeName ?? 'Unknown',
            players: r.players == null ? null : Number(r.players)
        }
    });
}

/**
 * Get list of all gamemodes with server counts
 */
export async function getGamemodeList(): Promise<GamemodeInfo[]> {
    const query = `
        SELECT smr.mode_name,
               COUNT(DISTINCT smh.server_id) AS server_count
        FROM server_maps_registry smr
                 JOIN server_maps_history smh ON smr.id = smh.map_id
        WHERE smr.mode_name IS NOT NULL
          AND smr.mode_name != ''
        GROUP BY smr.mode_name
        ORDER BY smr.mode_name
    `;

    const rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
    }) as RawGamemodeListRow[];

    return rows.map(r => ({
        modeName: r.mode_name,
        serverCount: Number(r.server_count),
        cleanName: removeColorsFromMindustry(r.mode_name) ?? "Null",
    }));
}

/**
 * Get server share for a specific gamemode
 */
export async function getServerShareByGamemode(
    modeName: string,
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<ServerShareEntry[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1;
    }

    const { query, replacements } = buildServerShareQuery(
        modeName,
        hoursBack,
        bucketMinutes * 60,
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