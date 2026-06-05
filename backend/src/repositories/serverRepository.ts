import sequelize from '../config/database.js';
import {Server, ServerGroup, ServerMapHistory, ServerMotdHistory, ServerStats} from '../models/index.js';
import {
    GameMode,
    ServerDetails,
    ServerHistory,
    ServerMapData,
    ServerMotdData,
    ServerElement
} from '../../../common/models/serverData.js';
import {createLogger} from '../logger.js';
import {Op, QueryTypes, Transaction} from "sequelize";

const logger = createLogger("Repository");

// todo WHY is this here, WHY is it not in models/index.ts ???
export interface ServerRecord {
    id: number;
    name: string;
    host: string;
    port: number;
    created_at: Date;
    updated_at: Date;
}

export async function getServers(): Promise<ServerRecord[]> {
    const servers = await Server.findAll();
    const serverGroups = await ServerGroup.findAll();

    const serverGroupMap = new Map<number, string>();
    serverGroups.forEach((group: any) => {
        serverGroupMap.set(group.id, group.name);
    });

    return  servers.map((server: any) => {
        const serverRecord = server.toJSON() as ServerRecord;
        serverRecord.name = serverGroupMap.get(server.server_group_id) || 'Unknown';
        return serverRecord;
    });
}

// Get all servers with their latest stats
export async function getAllServerElements(hoursBack: number = 36): Promise<ServerElement[]> {
    const result = await sequelize.query(`
        WITH latest_motds AS (
            SELECT DISTINCT ON (h.server_id)
                h.server_id,
                r.server_name as "serverName",
                r.description,
                h.valid_from
            FROM server_motds_history h
                     JOIN server_motds_registry r ON h.motd_id = r.id
            WHERE h.valid_to IS NULL
            ORDER BY h.server_id, h.valid_from DESC
        ),
             latest_maps AS (
                 SELECT DISTINCT ON (h.server_id)
                     h.server_id,
                     r.map_name as "mapName",
                     r.game_mode as mode,
                     r.mode_name as "modeName", -- Sourced from map registry now
                     h.valid_from
                 FROM server_maps_history h
                          JOIN server_maps_registry r ON h.map_id = r.id
                 WHERE h.valid_to IS NULL
                 ORDER BY h.server_id, h.valid_from DESC
             ),
             latest_stats AS (
                 SELECT DISTINCT ON (server_id) server_id,
                                                timestamp, players, max_players, wave, version, version_type, ping, online
                 FROM server_stats
                 WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
                   AND players >= 0 AND players < 100
                 ORDER BY server_id, timestamp DESC
             )
        SELECT s.id, sg.name, s.host, s.port, s.country_code, s.updated_at as "lastUpdated", s.last_seen,
               stats.online, stats.timestamp, stats.players, stats.max_players as "playerLimit",
               stats.wave, stats.version, stats.version_type as "versionType", stats.ping,
               motds."serverName", motds.description, maps."modeName", maps."mapName", maps.mode
        FROM servers s
                 LEFT JOIN latest_stats stats ON s.id = stats.server_id
                 LEFT JOIN latest_motds motds ON s.id = motds.server_id
                 LEFT JOIN latest_maps maps ON s.id = maps.server_id
                 LEFT JOIN server_groups sg ON s.server_group_id = sg.id
        ORDER BY sg.name, s.host, s.port
    `, {
        replacements: { hoursBack },
        type: QueryTypes.SELECT
    });

    return result.map((row: any) => {
        const serverWithHistory: ServerElement = {
            id: row.id,
            name: row.name,
            host: row.host,
            port: row.port,
            online: row.online || false,
            lastSeen: row.last_seen,
            lastUpdated: row.lastUpdated?.getTime() || Date.now(),
            countryCode: row.country_code || null
        };

        if (row.timestamp) {
            serverWithHistory.currentData = {
                ping: row.ping || 0,
                host: row.host,
                port: row.port,
                serverName: row.serverName || 'Unknown',
                mapName: row.mapName || 'Unknown',
                players: row.players || 0,
                wave: row.wave || 0,
                version: row.version || 0,
                versionType: row.versionType || 'Unknown',
                mode: row.mode || 0,
                playerLimit: row.playerLimit || 0,
                description: row.description || '',
                modeName: row.modeName || '',
                online: row.online || false
            };
        }

        return serverWithHistory;
    });
}

export async function getMapHistory(serverId: number, page: number = 1, perPage: number = 20): Promise<{ data: any[], total: number }> {
    const offset = (page - 1) * perPage;

    const countResult: any = await sequelize.query(
        `SELECT COUNT(*) as count FROM server_maps_history WHERE server_id = :serverId`,
        { replacements: { serverId }, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].count, 10);

    const rows = await sequelize.query(
        `SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.map_name, r.game_mode, r.mode_name
         FROM server_maps_history h
         JOIN server_maps_registry r ON h.map_id = r.id
         WHERE h.server_id = :serverId
         ORDER BY h.valid_from DESC LIMIT :perPage OFFSET :offset`,
        { replacements: { serverId, perPage, offset }, type: QueryTypes.SELECT }
    );
    return { data: rows, total };
}

export async function getMotdHistory(serverId: number, page: number = 1, perPage: number = 20): Promise<{ data: any[], total: number }> {
    const offset = (page - 1) * perPage;

    const countResult: any = await sequelize.query(
        `SELECT COUNT(*) as count FROM server_motds_history WHERE server_id = :serverId`,
        { replacements: { serverId }, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].count, 10);

    const rows = await sequelize.query(
        `SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.server_name, r.description
         FROM server_motds_history h
         JOIN server_motds_registry r ON h.motd_id = r.id
         WHERE h.server_id = :serverId
         ORDER BY h.valid_from DESC LIMIT :perPage OFFSET :offset`,
        { replacements: { serverId, perPage, offset }, type: QueryTypes.SELECT }
    );
    return { data: rows, total };
}

/**
 * Get aggregated player history for a server with time bucket aggregation
 * Uses MAX to preserve peak values when aggregating
 */
export async function getAggregatedHistory(
    serverId: number,
    hoursBack: number = 24,
    bucketMinutes: number = 0,
    startDate?: number,
    endDate?: number
): Promise<Array<ServerHistory>> {
    let query: string;
    let replacements: Record<string, unknown>;

    if (bucketMinutes === 0) {
        if (startDate && endDate) {
            query = `
                SELECT extract(epoch from timestamp) * 1000 as timestamp, players
                FROM server_stats WHERE server_id = :serverId
                                    AND timestamp >= to_timestamp(:startDate / 1000.0)
                                    AND timestamp <= to_timestamp(:endDate / 1000.0)
                                    AND players >= 0 AND players < 100 ORDER BY timestamp
            `;
            replacements = { serverId, startDate, endDate };
        } else {
            query = `
                SELECT extract(epoch from timestamp) * 1000 as timestamp, players
                FROM server_stats WHERE server_id = :serverId
                                    AND timestamp > NOW() - interval '1 hour' * :hoursBack
                                    AND players >= 0 AND players < 100 ORDER BY timestamp
            `;
            replacements = { serverId, hoursBack };
        }
    } else {
        const bucketSeconds = bucketMinutes * 60;
        if (startDate && endDate) {
            query = `
                WITH time_range AS (
                    SELECT to_timestamp(floor(:startDate / 1000.0 / :bucketSeconds) * :bucketSeconds) as range_start,
                           to_timestamp(floor(:endDate / 1000.0 / :bucketSeconds) * :bucketSeconds) as range_end
                ),
                     all_buckets AS (
                         SELECT generate_series((SELECT range_start FROM time_range), (SELECT range_end FROM time_range), (:bucketSeconds || ' seconds')::interval) as bucket
                     ),
                     bucketed AS (
                         SELECT to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket, players
                         FROM server_stats WHERE server_id = :serverId
                                             AND timestamp >= to_timestamp(:startDate / 1000.0)
                                             AND timestamp <= to_timestamp(:endDate / 1000.0)
                                             AND players >= 0 AND players < 100
                     ),
                     aggregated AS (
                         SELECT bucket, MAX(players) as players FROM bucketed GROUP BY bucket
                     )
                SELECT extract(epoch from all_buckets.bucket) * 1000 as timestamp, aggregated.players
                FROM all_buckets LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket ORDER BY all_buckets.bucket
            `;
            replacements = { serverId, startDate, endDate, bucketSeconds };
        } else {
            query = `
                WITH time_range AS (
                    SELECT to_timestamp(floor(extract(epoch from NOW() - interval '1 hour' * :hoursBack) / :bucketSeconds) * :bucketSeconds) as range_start,
                           to_timestamp(floor(extract(epoch from NOW()) / :bucketSeconds) * :bucketSeconds) as range_end
                ),
                     all_buckets AS (
                         SELECT generate_series((SELECT range_start FROM time_range), (SELECT range_end FROM time_range), (:bucketSeconds || ' seconds')::interval) as bucket
                     ),
                     bucketed AS (
                         SELECT to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket, players
                         FROM server_stats WHERE server_id = :serverId
                                             AND timestamp > NOW() - interval '1 hour' * :hoursBack
                                             AND players >= 0 AND players < 100
                     ),
                     aggregated AS (
                         SELECT bucket, MAX(players) as players FROM bucketed GROUP BY bucket
                     )
                SELECT extract(epoch from all_buckets.bucket) * 1000 as timestamp, aggregated.players
                FROM all_buckets LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket ORDER BY all_buckets.bucket
            `;
            replacements = { serverId, bucketSeconds, hoursBack };
        }
    }

    const result = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as Array<{ timestamp: number; players: number | null }>;
    return result.map((row) => ({ timestamp: Number(row.timestamp), players: row.players }));
}

/**
 * Get aggregated global player history (sum of all servers' players over time)
 * Uses MAX per server within each time bucket, then sums across servers
 */
export async function getGlobalPlayerHistory(hoursBack: number = 24, bucketMinutes: number = 0): Promise<Array<ServerHistory>> {
    let query: string;
    let replacements: Record<string, unknown>;

    if (bucketMinutes === 0) {
        query = `
            WITH server_players AS (
                SELECT timestamp, server_id, MAX(players) as max_players
                FROM server_stats WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
                                    AND players >= 0 AND players < 100 GROUP BY timestamp, server_id
            )
            SELECT extract(epoch from timestamp) * 1000 as timestamp, SUM(max_players) as players
            FROM server_players GROUP BY timestamp ORDER BY timestamp
        `;
        replacements = { hoursBack };
    } else {
        const bucketSeconds = bucketMinutes * 60;
        query = `
            WITH time_range AS (
                SELECT to_timestamp(floor(extract(epoch from NOW() - interval '1 hour' * :hoursBack) / :bucketSeconds) * :bucketSeconds) as range_start,
                       to_timestamp(floor(extract(epoch from NOW()) / :bucketSeconds) * :bucketSeconds) as range_end
            ),
                 all_buckets AS (
                     SELECT generate_series((SELECT range_start FROM time_range), (SELECT range_end FROM time_range), (:bucketSeconds || ' seconds')::interval) as bucket
                 ),
                 bucketed AS (
                     SELECT server_id, to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket, players
                     FROM server_stats WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
                                         AND players >= 0 AND players < 100
                 ),
                 server_max AS (
                     SELECT bucket, server_id, MAX(players) as max_players FROM bucketed GROUP BY bucket, server_id
                 ),
                 aggregated AS (
                     SELECT bucket, SUM(max_players) as players FROM server_max GROUP BY bucket
                 )
            SELECT extract(epoch from all_buckets.bucket) * 1000 as timestamp, aggregated.players
            FROM all_buckets LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket ORDER BY all_buckets.bucket
        `;
        replacements = { hoursBack, bucketSeconds };
    }

    const result = await sequelize.query(query, { replacements, type: QueryTypes.SELECT }) as Array<{ timestamp: number; players: number | null }>;
    return result.map((row) => ({ timestamp: Number(row.timestamp), players: Number(row.players) }));
}

// Get detailed information about a specific server
export async function getServer(serverId: number): Promise<ServerElement & ServerDetails | undefined> {
    const [result]: any = await sequelize.query(`SELECT * FROM get_server_details($1)`, {
        bind: [serverId],
        type: "SELECT"
    });

    if (!result) return undefined;

    const allMapsData: ServerMapData[] = (result.detail_all_maps || []).map((map: any) => ({
        id: map.id,
        serverId: map.serverId,
        validFrom: new Date(map.validFrom),
        validTo: map.validTo ? new Date(map.validTo) : null,
        mapName: map.mapName,
        gameMode: map.gameMode as GameMode
    }));

    const allMotdsData: ServerMotdData[] = (result.detail_all_motds || []).map((motd: any) => ({
        id: motd.id,
        serverId: motd.serverId,
        validFrom: new Date(motd.validFrom),
        validTo: motd.validTo ? new Date(motd.validTo) : null,
        serverName: motd.serverName,
        description: motd.description,
        modeName: motd.modeName
    }));

    const serverWithDetails: ServerElement & ServerDetails = {
        id: result.detail_id,
        name: result.detail_name,
        host: result.detail_host,
        port: result.detail_port,
        online: result.detail_online || false,
        lastUpdated: result.detail_last_updated?.getTime() || Date.now(),
        playerPeaks: {
            allTime: result.detail_all_time_peak || 0,
            allTimeDate: result.detail_peak_date || new Date(),
            daily: result.detail_daily_peak || 0,
            weekly: result.detail_weekly_peak || 0
        },
        uptime: {
            last24h: parseFloat(result.detail_24h_uptime) || 0,
            last7d: parseFloat(result.detail_7d_uptime) || 0
        },
        allMaps: allMapsData,
        allMotds: allMotdsData,
        currentMotd: allMotdsData.find(motd => motd.validTo === null) || allMotdsData[0] || null,
        currentMap: allMapsData.find(map => map.validTo === null) || allMapsData[0] || null
    };

    if (result.detail_timestamp) {
        const currentMotd = serverWithDetails.currentMotd;
        const currentMap = serverWithDetails.currentMap;

        serverWithDetails.currentData = {
            ping: result.detail_ping || 0,
            host: result.detail_host,
            port: result.detail_port,
            serverName: result.detail_display_name || currentMotd?.serverName || 'Unknown',
            mapName: result.detail_map_name || currentMap?.mapName || 'Unknown',
            players: result.detail_players || 0,
            wave: result.detail_wave || 0,
            version: result.detail_version || 0,
            versionType: result.detail_version_type || 'Unknown',
            mode: (result.detail_mode ?? currentMap?.gameMode ?? 0) as GameMode,
            playerLimit: result.detail_player_limit || 0,
            description: result.detail_description || currentMotd?.description || '',
            modeName: result.detail_mode_name || currentMotd?.modeName || '',
            online: result.detail_online || false
        };
    }

    return serverWithDetails;
}

export interface ServerInput {
    name: string;
    host: string;
    port: number;
}

export async function batchUpsertServers(servers: ServerInput[]): Promise<void> {
    if (servers.length === 0) return;

    try {

        // Deduplicate based on (name, host, port)
        const deduplicated = servers.reduce((acc, current) => {
            const key = `${current.name}|${current.host}|${current.port}`;
            if (!acc.has(key)) {
                acc.set(key, current);
            }
            return acc;
        }, new Map<string, ServerInput>());

        // Convert to a format PostgreSQL can handle better
        const serverData = Array.from(deduplicated.values()).map((s, idx) => ({
            idx,
            name: s.name,
            host: s.host,
            port: s.port
        }));

        await sequelize.query(`
            WITH server_data AS (
                SELECT * FROM jsonb_to_recordset(:serverData::jsonb)
                                  AS x(idx int, name text, host text, port int)
            ),
                 grouped AS (
                     INSERT INTO server_groups (name)
                         SELECT DISTINCT name FROM server_data
                         ON CONFLICT (name) DO NOTHING
                 )
            INSERT INTO servers (host, port, server_group_id)
            SELECT sd.host, sd.port, g.id
            FROM server_data sd
                     LEFT JOIN server_groups g ON g.name = sd.name
            ON CONFLICT (host, port, server_group_id) DO UPDATE
                SET server_group_id = EXCLUDED.server_group_id,
                    updated_at = NOW()
        `, {
            replacements: { serverData: JSON.stringify(serverData) },
            type: QueryTypes.INSERT
        });
    } catch (error) {
        logger.error('Error batch upserting servers:', error);
        throw error;
    }
}

export async function bulkUpdateLastSeen(serverIds: number[]): Promise<void> {
    if (!serverIds.length) return;

    await Server.update(
        { last_seen: new Date() },
        { where: { id: { [Op.in]: serverIds } } }
    );
}

export async function bulkSaveServerStats(statsBatch: any[]): Promise<void> {
    if (!statsBatch.length) return;

    // Sequelize bulkCreate is highly optimized and compiles to a single INSERT statement
    await ServerStats.bulkCreate(statsBatch);
}

export async function bulkSaveMotds(newMotds: any[]): Promise<void> {
    if (!newMotds.length) return;

    // 1. Deduplicate the incoming batch for the registry
    const uniqueMotds = new Map<string, any>();
    for (const m of newMotds) {
        const key = `${m.server_name}|${m.description}`;
        if (!uniqueMotds.has(key)) {
            uniqueMotds.set(key, m);
        }
    }

    const registryData = Array.from(uniqueMotds.values()).map(m => ({
        server_name: m.server_name || '',
        description: m.description || ''
    }));

    // 2. Upsert Registry Data
    await sequelize.query(`
        INSERT INTO server_motds_registry (server_name, description)
        SELECT server_name, description 
        FROM jsonb_to_recordset(:registryData::jsonb) AS x(server_name text, description text)
        ON CONFLICT (server_name, description) DO NOTHING;
    `, {
        replacements: { registryData: JSON.stringify(registryData) },
        type: QueryTypes.INSERT
    });

    // 3. Fetch the IDs for the mapping
    const registries: any[] = await sequelize.query(`
        SELECT id, server_name, description
        FROM server_motds_registry
        WHERE (server_name, description) IN (
            SELECT server_name, description 
            FROM jsonb_to_recordset(:registryData::jsonb) AS x(server_name text, description text)
        )
    `, {
        replacements: { registryData: JSON.stringify(registryData) },
        type: QueryTypes.SELECT
    });

    // 4. Create a quick lookup map
    const registryMap = new Map<string, number>();
    const normalize = (val: string) => (val == null || val === '') ? '' : val;
    registries.forEach(r => registryMap.set(`${normalize(r.server_name)}|${normalize(r.description)}`, r.id));

    const serverIds = newMotds.map(m => m.server_id);
    const now = new Date();

    // 5. Update History inside a transaction
    await sequelize.transaction(async (t: Transaction) => {
        // Close the old active MOTDs
        await ServerMotdHistory.update(
            { valid_to: now },
            {
                where: {
                    server_id: { [Op.in]: serverIds },
                    valid_to: null
                },
                transaction: t
            }
        );

        // Insert the new ones referencing the registry ID
        const historyToInsert = newMotds.map(m => {
            const key = `${normalize(m.server_name)}|${normalize(m.description)}`;
            if (!registryMap.get(key)) {
                logger.error('Error updating server map');
            }
            return {
                server_id: m.server_id,
                motd_id: registryMap.get(key), // The critical change
                valid_from: now
            };
        });

        await ServerMotdHistory.bulkCreate(historyToInsert, { transaction: t });
    });
}

export async function bulkSaveMaps(newMaps: any[]): Promise<void> {
    if (!newMaps.length) return;

    // 1. Deduplicate the incoming batch for the registry
    const uniqueMaps = new Map<string, any>();
    for (const m of newMaps) {
        // Create a composite key to ensure uniqueness in memory
        const key = `${m.map_name}|${m.game_mode}|${m.mode_name}`;
        if (!uniqueMaps.has(key)) {
            uniqueMaps.set(key, m);
        }
    }

    const registryData = Array.from(uniqueMaps.values()).map(m => ({
        map_name: m.map_name || 'Unknown',
        game_mode: m.game_mode || 0,
        mode_name: m.mode_name || ''
    }));

    // 2. Upsert Registry Data
    await sequelize.query(`
        INSERT INTO server_maps_registry (map_name, game_mode, mode_name)
        SELECT map_name, game_mode, mode_name 
        FROM jsonb_to_recordset(:registryData::jsonb) AS x(map_name text, game_mode smallint, mode_name text)
        ON CONFLICT (map_name, game_mode, mode_name) DO NOTHING;
    `, {
        replacements: { registryData: JSON.stringify(registryData) },
        type: QueryTypes.INSERT
    });

    // 3. Fetch the IDs for the mapping
    const registries: any[] = await sequelize.query(`
        SELECT id, map_name, game_mode, mode_name
        FROM server_maps_registry
        WHERE (map_name, game_mode, mode_name) IN (
            SELECT map_name, game_mode, mode_name 
            FROM jsonb_to_recordset(:registryData::jsonb) AS x(map_name text, game_mode smallint, mode_name text)
        )
    `, {
        replacements: { registryData: JSON.stringify(registryData) },
        type: QueryTypes.SELECT
    });

    // 4. Create a quick lookup map using the unique natural keys instead of the database ID
    const registryMap = new Map<string, number>();
    const normalize = (val: any) => (val == null || val === '') ? '' : String(val);

    registries.forEach(r => {
        // Key on the map properties, store the database ID as the value
        const key = `${normalize(r.map_name)}|${normalize(r.game_mode)}|${normalize(r.mode_name)}`;
        registryMap.set(key, r.id);
    });

    const serverIds = newMaps.map(m => m.server_id);
    const now = new Date();

// 5. Update History inside a transaction
    await sequelize.transaction(async (t: Transaction) => {
        // Close the old active Maps
        await ServerMapHistory.update(
            { valid_to: now },
            {
                where: {
                    server_id: { [Op.in]: serverIds },
                    valid_to: null
                },
                transaction: t
            }
        );

        // Insert the new ones referencing the registry ID
        const historyToInsert = newMaps.map(m => {
            // Use map_name here to match the lookup map structure
            const key = `${normalize(m.map_name)}|${normalize(m.game_mode)}|${normalize(m.mode_name)}`;
            const registryId = registryMap.get(key);

            if (!registryId) {
                logger.error(`Error updating server map: Registry ID not found for key: ${key}`);
            }

            return {
                server_id: m.server_id,
                map_id: registryId, // Safely links to the new registry ID
                valid_from: now
            };
        });

        await ServerMapHistory.bulkCreate(historyToInsert, { transaction: t });
    });
}