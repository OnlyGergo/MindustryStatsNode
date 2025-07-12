import sequelize from '../config/database';
import {Server, ServerGroup, ServerMap, ServerMotd, ServerStats} from "../models";
import {ServerData, ServerDetails, ServerWithHistory} from "../../../common/models/serverData";
import {ServerListElement} from "../models/ServerListElement";
import {createLogger} from "../logger";
import {QueryTypes} from "sequelize";

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
    serverGroups.forEach(group => {
        serverGroupMap.set(group.id, group.name);
    });

    return  servers.map(server => {
        const serverRecord = server.toJSON() as ServerRecord;
        serverRecord.name = serverGroupMap.get(server.server_group_id) || 'Unknown';
        return serverRecord;
    });
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
        WHERE timestamp > NOW() - interval '${hoursBack} hours'
        ORDER BY server_id, timestamp DESC),
            history_data AS (
        SELECT server_id, json_agg(
            json_build_object(
            'timestamp', extract (epoch from timestamp) * 1000, 'players', players
            )
            ORDER BY timestamp
            ) as history_json
        FROM server_stats
        WHERE timestamp > NOW() - interval '${hoursBack} hours'
        GROUP BY server_id)
        SELECT s.id,
               sg.name,
               s.host,
               s.port,
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
        type: "SELECT"
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
            lastUpdated: row.lastUpdated?.getTime() || Date.now()
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

export async function getMapHistory(serverId: number): Promise<ServerMap[]> {
    return await ServerMap.findAll({
        where: {
            server_id: serverId
        },
        limit: 500
    })
}

export async function getMotdHistory(serverId: number): Promise<ServerMotd[]> {
    return await ServerMotd.findAll({
        where: {
            server_id: serverId
        },
        limit: 500
    })
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

    const serverWithDetails: ServerWithHistory & ServerDetails = {
        id: result.detail_id,
        name: result.detail_name,
        host: result.detail_host,
        port: result.detail_port,
        history: [],
        online: result.detail_online || false,
        lastUpdated: result.detail_lastUpdated?.getTime() || Date.now(),
        mapHistory: result.detail_map_history || [],
        motdHistory: result.detail_motd_history || [],
        playerPeaks: {
            allTime: result.detail_all_time_peak || 0,
            allTimeDate: result.detail_peak_date || new Date(),
            daily: result.detail_daily_peak || 0,
            weekly: result.detail_weekly_peak || 0
        },
        uptime: {
            last24h: parseFloat(result.detail_24h_uptime) || 0,
            last7d: parseFloat(result.detail_7d_uptime) || 0
        }
    };

    // Add current data if we have stats
    if (result.timestamp) {
        serverWithDetails.currentData = {
            ping: result.detail_ping || 0,
            host: result.detail_host,
            port: result.detail_port,
            serverName: result.detail_name || 'Unknown',
            mapName: result.detail_map_name || 'Unknown',
            players: result.detail_players || 0,
            wave: result.detail_wave || 0,
            version: result.detail_version || 0,
            versionType: result.detail_version_type || 'Unknown',
            mode: result.detail_mode || 0,
            playerLimit: result.detail_player_limit || 0,
            description: result.detail_description || '',
            modeName: result.detail_mode_name || '',
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

                await sequelize.query(
                    `SELECT add_server_and_group(:name, :host, :port);`,
                    {
                        replacements: { name: server.name, host, port },
                        type: QueryTypes.SELECT
                    }
                );
            }
        }
    } catch (error) {
        logger.error('Error calling function:', error);
        throw error;
    }
}