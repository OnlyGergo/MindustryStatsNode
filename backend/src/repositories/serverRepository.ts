import sequelize from '../config/database.js';
import {Server, ServerGroup, ServerMap, ServerMotd, ServerStats} from '../models/index.js';
import {
    GameMode,
    ServerData,
    ServerDetails,
    ServerMapData,
    ServerMotdData,
    ServerWithHistory
} from '../../../common/models/serverData.js';
import {ServerListElement} from '../models/ServerListElement.js';
import {createLogger} from '../logger.js';
import {QueryTypes} from "sequelize";
import { lookupCountry } from '../utils/countryLookup.js';

const logger = createLogger("Repository");

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

// Update last_seen timestamp for a server
export async function updateServerLastSeen(
    serverId: number
): Promise<void> {
    await Server.update(
        { last_seen: new Date() },
        { where: { id: serverId } }
    );
}

// Update country code for a server based on its host IP
export async function updateServerCountryCode(
    serverId: number,
    host: string
): Promise<void> {
    try {
        const countryCode = await lookupCountry(host);
        if (countryCode) {
            await Server.update(
                { country_code: countryCode },
                { where: { id: serverId } }
            );
            logger.debug(`Updated country code for server ${serverId} to ${countryCode}`);
        }
    } catch (error) {
        logger.warn(`Failed to update country code for server ${serverId}:`, error);
    }
}

// Save server stats
export async function saveServerStats(
    serverId: number,
    data: ServerData
): Promise<void> {
    await ServerStats.create({
        server_id: serverId,
        timestamp: new Date(),
        players: data.players,
        max_players: data.playerLimit,
        wave: data.wave,
        version: data.version,
        version_type: data.versionType,
        ping: data.ping,
        online: data.online
    })
}

// Check and save MOTD if changed
export async function saveMotdIfChanged(
    serverId: number,
    data: ServerData
): Promise<void> {
    const lastMotd = await ServerMotd.findOne({
        where: {
            server_id: serverId,
            valid_to: null
        },
        order: [['valid_from', 'DESC']]
    })

    // Check if MOTD has changed
    const motdChanged = !lastMotd ||
        lastMotd.server_name !== data.serverName ||
        lastMotd.description !== data.description ||
        lastMotd.mode_name !== data.modeName;

    if (motdChanged) {
        // Set the previous MOTD's valid_to date if it exists
        if (lastMotd) {
            await lastMotd.update({
                valid_to: new Date()
            });
        }

        // Insert the new MOTD
        await ServerMotd.create({
            server_id: serverId,
            valid_from: new Date(),
            server_name: data.serverName,
            description: data.description,
            mode_name: data.modeName
        });
    }
}

// Check and save Map if changed
export async function saveMapIfChanged(
    serverId: number,
    data: ServerData
): Promise<void> {
    // Get the most recent map for this server
    const lastMap = await ServerMap.findOne({
        where: {
            server_id: serverId,
            valid_to: null
        }
    })

    // Check if map has changed
    const mapChanged = !lastMap ||
        lastMap.map_name !== data.mapName;

    if (mapChanged) {
        // Update the previous map's valid_to date if it exists
        if (lastMap) {
            await lastMap.update({
                valid_to: new Date()
            });
        }

        // Insert the new map
        await ServerMap.create({
            server_id: serverId,
            valid_from: new Date(),
            map_name: data.mapName,
            game_mode: data.mode
        })
    }
}

// Get all servers with their latest stats
export async function getAllServersWithHistory(hoursBack: number = 36): Promise<ServerWithHistory[]> {
    const result = await sequelize.query(`
        WITH latest_motds AS (SELECT DISTINCT
        ON (server_id) server_id,
            server_name as "serverName",
            description,
            mode_name as "modeName",
            valid_from
        FROM server_motds
        WHERE valid_to IS NULL
        ORDER BY server_id, valid_from DESC),
            latest_maps AS (
        SELECT DISTINCT
        ON (server_id) server_id,
            map_name as "mapName",
            game_mode as mode,
            valid_from
        FROM server_maps
        WHERE valid_to IS NULL
        ORDER BY server_id, valid_from DESC),
            latest_stats AS (
        SELECT DISTINCT
        ON (server_id) server_id,
            timestamp,
            players,
            max_players,
            wave,
            version,
            version_type,
            ping,
            online
        FROM server_stats
        WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
          AND players >= 0 AND players < 1000
        ORDER BY server_id, timestamp DESC),
            history_data AS (
        SELECT server_id, json_agg(
            json_build_object(
            'timestamp', extract (epoch from timestamp) * 1000, 'players', players
            )
            ORDER BY timestamp
            ) as history_json
        FROM server_stats
        WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
          AND players >= 0 AND players < 1000
        GROUP BY server_id)
        SELECT s.id,
               sg.name,
               s.host,
               s.port,
               s.country_code,
               s.updated_at                         as "lastUpdated",
               s.last_seen,
               stats.online,
               stats.timestamp,
               stats.players,
               stats.max_players                    as "playerLimit",
               stats.wave,
               stats.version,
               stats.version_type                   as "versionType",
               stats.ping,
               motds."serverName",
               motds.description,
               motds."modeName",
               maps."mapName",
               maps.mode,
               COALESCE(h.history_json, '[]'::json) as history
        FROM servers s
                 LEFT JOIN latest_stats stats ON s.id = stats.server_id
                 LEFT JOIN latest_motds motds ON s.id = motds.server_id
                 LEFT JOIN latest_maps maps ON s.id = maps.server_id
                 LEFT JOIN history_data h ON s.id = h.server_id
                 LEFT JOIN server_groups sg ON s.server_group_id = sg.id
        ORDER BY sg.name, s.host, s.port
    `, {
        replacements: { hoursBack },
        type: QueryTypes.SELECT
    })

    return result.map((row: any) => {
        const serverWithHistory: ServerWithHistory = {
            id: row.id,
            name: row.name,
            host: row.host,
            port: row.port,
            history: row.history,
            online: row.online || false,
            lastSeen: row.last_seen,
            lastUpdated: row.lastUpdated?.getTime() || Date.now(),
            countryCode: row.country_code || null
        };

        // Only add currentData if we have stats
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

export async function getMapHistory(serverId: number, page: number = 1, perPage: number = 20): Promise<{ data: ServerMap[], total: number }> {
    const offset = (page - 1) * perPage;
    const { rows, count } = await ServerMap.findAndCountAll({
        where: {
            server_id: serverId
        },
        order: [['valid_from', 'DESC']],
        limit: perPage,
        offset: offset
    });
    return { data: rows, total: count };
}

export async function getMotdHistory(serverId: number, page: number = 1, perPage: number = 20): Promise<{ data: ServerMotd[], total: number }> {
    const offset = (page - 1) * perPage;
    const { rows, count } = await ServerMotd.findAndCountAll({
        where: {
            server_id: serverId
        },
        order: [['valid_from', 'DESC']],
        limit: perPage,
        offset: offset
    });
    return { data: rows, total: count };
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
): Promise<Array<{ timestamp: number; players: number }>> {
    let query: string;
    let replacements: Record<string, unknown>;

    if (bucketMinutes === 0) {
        // No aggregation - return raw data
        if (startDate && endDate) {
            query = `
                SELECT 
                    extract(epoch from timestamp) * 1000 as timestamp,
                    players
                FROM server_stats
                WHERE server_id = :serverId
                  AND timestamp >= to_timestamp(:startDate / 1000.0)
                  AND timestamp <= to_timestamp(:endDate / 1000.0)
                  AND players >= 0 AND players < 1000
                ORDER BY timestamp
            `;
            replacements = { serverId, startDate, endDate };
        } else {
            query = `
                SELECT 
                    extract(epoch from timestamp) * 1000 as timestamp,
                    players
                FROM server_stats
                WHERE server_id = :serverId
                  AND timestamp > NOW() - interval '1 hour' * :hoursBack
                  AND players >= 0 AND players < 1000
                ORDER BY timestamp
            `;
            replacements = { serverId, hoursBack };
        }
    } else {
        // Aggregate using time buckets with MAX to preserve peaks
        // Use epoch-based bucketing to properly respect bucketMinutes size
        // Generate all expected buckets to show gaps and maintain proper time scale
        const bucketSeconds = bucketMinutes * 60;
        
        if (startDate && endDate) {
            query = `
                WITH time_range AS (
                    SELECT 
                        to_timestamp(floor(:startDate / 1000.0 / :bucketSeconds) * :bucketSeconds) as range_start,
                        to_timestamp(floor(:endDate / 1000.0 / :bucketSeconds) * :bucketSeconds) as range_end
                ),
                all_buckets AS (
                    SELECT generate_series(
                        (SELECT range_start FROM time_range),
                        (SELECT range_end FROM time_range),
                        (:bucketSeconds || ' seconds')::interval
                    ) as bucket
                ),
                bucketed AS (
                    SELECT 
                        to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket,
                        players
                    FROM server_stats
                    WHERE server_id = :serverId
                      AND timestamp >= to_timestamp(:startDate / 1000.0)
                      AND timestamp <= to_timestamp(:endDate / 1000.0)
                      AND players >= 0 AND players < 1000
                ),
                aggregated AS (
                    SELECT bucket, MAX(players) as players
                    FROM bucketed
                    GROUP BY bucket
                )
                SELECT 
                    extract(epoch from all_buckets.bucket) * 1000 as timestamp,
                    aggregated.players
                FROM all_buckets
                LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket
                ORDER BY all_buckets.bucket
            `;
            replacements = { serverId, startDate, endDate, bucketSeconds };
        } else {
            query = `
                WITH time_range AS (
                    SELECT 
                        to_timestamp(floor(extract(epoch from NOW() - interval '1 hour' * :hoursBack) / :bucketSeconds) * :bucketSeconds) as range_start,
                        to_timestamp(floor(extract(epoch from NOW()) / :bucketSeconds) * :bucketSeconds) as range_end
                ),
                all_buckets AS (
                    SELECT generate_series(
                        (SELECT range_start FROM time_range),
                        (SELECT range_end FROM time_range),
                        (:bucketSeconds || ' seconds')::interval
                    ) as bucket
                ),
                bucketed AS (
                    SELECT 
                        to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket,
                        players
                    FROM server_stats
                    WHERE server_id = :serverId
                      AND timestamp > NOW() - interval '1 hour' * :hoursBack
                      AND players >= 0 AND players < 1000
                ),
                aggregated AS (
                    SELECT bucket, MAX(players) as players
                    FROM bucketed
                    GROUP BY bucket
                )
                SELECT 
                    extract(epoch from all_buckets.bucket) * 1000 as timestamp,
                    aggregated.players
                FROM all_buckets
                LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket
                ORDER BY all_buckets.bucket
            `;
            replacements = { serverId, bucketSeconds, hoursBack };
        }
    }

    const result = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as Array<{ timestamp: number; players: number | null }>;

    return result.map((row) => ({
        timestamp: Number(row.timestamp),
        players: row.players
    }));
}

/**
 * Get aggregated global player history (sum of all servers' players over time)
 * Uses MAX per server within each time bucket, then sums across servers
 */
export async function getGlobalPlayerHistory(
    hoursBack: number = 24,
    bucketMinutes: number = 0
): Promise<Array<{ timestamp: number; players: number }>> {
    let query: string;
    let replacements: Record<string, unknown>;

    if (bucketMinutes === 0) {
        // No aggregation - but still use MAX per server at each timestamp to avoid counting duplicates
        query = `
            WITH server_players AS (
                SELECT 
                    timestamp,
                    server_id,
                    MAX(players) as max_players
                FROM server_stats
                WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
                  AND players >= 0 AND players < 1000
                GROUP BY timestamp, server_id
            )
            SELECT 
                extract(epoch from timestamp) * 1000 as timestamp,
                SUM(max_players) as players
            FROM server_players
            GROUP BY timestamp
            ORDER BY timestamp
        `;
        replacements = { hoursBack };
    } else {
        // Aggregate using time buckets - MAX per server, then SUM across servers
        // Use epoch-based bucketing to properly respect bucketMinutes size
        // Generate all expected buckets to show gaps and maintain proper time scale
        const bucketSeconds = bucketMinutes * 60;
        query = `
            WITH time_range AS (
                SELECT 
                    to_timestamp(floor(extract(epoch from NOW() - interval '1 hour' * :hoursBack) / :bucketSeconds) * :bucketSeconds) as range_start,
                    to_timestamp(floor(extract(epoch from NOW()) / :bucketSeconds) * :bucketSeconds) as range_end
            ),
            all_buckets AS (
                SELECT generate_series(
                    (SELECT range_start FROM time_range),
                    (SELECT range_end FROM time_range),
                    (:bucketSeconds || ' seconds')::interval
                ) as bucket
            ),
            bucketed AS (
                SELECT 
                    server_id,
                    to_timestamp(floor(extract(epoch from timestamp) / :bucketSeconds) * :bucketSeconds) as bucket,
                    players
                FROM server_stats
                WHERE timestamp > NOW() - interval '1 hour' * :hoursBack
                  AND players >= 0 AND players < 1000
            ),
            server_max AS (
                SELECT 
                    bucket,
                    server_id,
                    MAX(players) as max_players
                FROM bucketed
                GROUP BY bucket, server_id
            ),
            aggregated AS (
                SELECT bucket, SUM(max_players) as players
                FROM server_max
                GROUP BY bucket
            )
            SELECT 
                extract(epoch from all_buckets.bucket) * 1000 as timestamp,
                aggregated.players
            FROM all_buckets
            LEFT JOIN aggregated ON all_buckets.bucket = aggregated.bucket
            ORDER BY all_buckets.bucket
        `;
        replacements = { hoursBack, bucketSeconds };
    }

    const result = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as Array<{ timestamp: number; players: number | null }>;

    return result.map((row) => ({
        timestamp: Number(row.timestamp),
        players: Number(row.players)
    }));
}

// Get detailed information about a specific server
export async function getServer(
    serverId: number
): Promise<ServerWithHistory & ServerDetails | undefined> {
    const [result]: any = await sequelize.query(`SELECT * FROM get_server_details($1)`, {
        bind: [serverId],
        type: "SELECT"
    });

    if (!result) {
        return undefined;
    }

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

    const serverWithDetails: ServerWithHistory & ServerDetails = {
        id: result.detail_id,
        name: result.detail_name,
        host: result.detail_host,
        port: result.detail_port,
        history: [],
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
        // New: Complete arrays of all records
        allMaps: allMapsData,
        allMotds: allMotdsData,
        // Keep current records for convenience (first active record or most recent)
        currentMotd: allMotdsData.find(motd => motd.validTo === null) || allMotdsData[0] || null,
        currentMap: allMapsData.find(map => map.validTo === null) || allMapsData[0] || null
    };

    // Add current data if we have stats
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

// Could be more efficient by querying and comparing.... but it runs once every 5 hours so it's fine
export async function ensureServers(servers: ServerListElement[]): Promise<void> {
    try {
        for (const server of servers) {
            for (const address of server.address) {
                // Split host to address and port
                const [host, portStr] = address.split(':');
                const port = portStr ? parseInt(portStr, 10) : 6567;

                // Add server to database
                const result = await sequelize.query(
                    `SELECT add_server_and_group(:name, :host, :port);`,
                    {
                        replacements: { name: server.name, host, port },
                        type: QueryTypes.SELECT
                    }
                );

                // Look up and update country code for the server
                // Find the server ID and update country code if not already set
                const serverRecord = await Server.findOne({
                    where: { host, port }
                });

                if (serverRecord && !serverRecord.country_code) {
                    const countryCode = await lookupCountry(host);
                    if (countryCode) {
                        await serverRecord.update({ country_code: countryCode });
                        logger.debug(`Set country code for ${host}:${port} to ${countryCode}`);
                    }
                }
            }
        }
    } catch (error) {
        logger.error('Error calling function:', error);
        throw error;
    }
}