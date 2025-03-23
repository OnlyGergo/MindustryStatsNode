import { query } from '../config/database';
import {
    ServerData,
    ServerDetails,
    ServerWithHistory
} from '../../../common/models/serverData';

export interface ServerRecord {
  id: number;
  name: string;
  host: string;
  port: number;
  created_at: Date;
  updated_at: Date;
}

// Create or update a server in the database
export async function upsertServer(config: {
  name: string;
  host: string;
  port: number;
  lastSeen?: number;
}): Promise<ServerRecord> {
    const result = await query(
        `INSERT INTO servers (name, host, port, last_seen)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (host, port)
             DO UPDATE SET
                 name = $1,
                 updated_at = NOW(),
                 last_seen = COALESCE($4, servers.last_seen)
         RETURNING *`,
        [config.name, config.host, config.port, config.lastSeen ? new Date(config.lastSeen) : null]
    );

  return result.rows[0];
}

// Save server stats
export async function saveServerStats(
  serverId: number,
  data: ServerData
): Promise<void> {
  await query(
    `INSERT INTO server_stats 
     (server_id, timestamp, players, max_players, wave, 
      version, version_type, ping, online)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
    [
      serverId,
      data.players,
      data.playerLimit,
      data.wave,
      data.version,
      data.versionType,
      data.ping,
      data.online
    ]
  );
}

// Check and save MOTD if changed
export async function saveMotdIfChanged(
  serverId: number,
  data: ServerData
): Promise<void> {
  // Get the most recent MOTD for this server
  const lastMotdResult = await query(
    `SELECT id, server_name, description, mode_name 
     FROM server_motds 
     WHERE server_id = $1 AND valid_to IS NULL
     LIMIT 1`,
    [serverId]
  );
  
  const lastMotd = lastMotdResult.rows[0];
  
  // Check if MOTD has changed
  const motdChanged = !lastMotd || 
    lastMotd.server_name !== data.serverName ||
    lastMotd.description !== data.description ||
    lastMotd.mode_name !== data.modeName;
  
  if (motdChanged) {
    // Update the previous MOTD's valid_to date if it exists
    if (lastMotd) {
      await query(
        `UPDATE server_motds SET valid_to = NOW()
         WHERE id = $1`,
        [lastMotd.id]
      );
    }
    
    // Insert the new MOTD
    await query(
      `INSERT INTO server_motds 
       (server_id, valid_from, server_name, description, mode_name)
       VALUES ($1, NOW(), $2, $3, $4)`,
      [serverId, data.serverName, data.description, data.modeName]
    );
  }
}

// Check and save Map if changed
export async function saveMapIfChanged(
  serverId: number,
  data: ServerData
): Promise<void> {
  // Get the most recent map for this server
  const lastMapResult = await query(
    `SELECT id, map_name, game_mode 
     FROM server_maps 
     WHERE server_id = $1 AND valid_to IS NULL
     LIMIT 1`,
    [serverId]
  );
  
  const lastMap = lastMapResult.rows[0];
  
  // Check if map has changed
  const mapChanged = !lastMap || 
    lastMap.map_name !== data.mapName;
  
  if (mapChanged) {
    // Update the previous map's valid_to date if it exists
    if (lastMap) {
      await query(
        `UPDATE server_maps SET valid_to = NOW()
         WHERE id = $1`,
        [lastMap.id]
      );
    }
    
    // Insert the new map
    await query(
      `INSERT INTO server_maps 
       (server_id, valid_from, map_name, game_mode)
       VALUES ($1, NOW(), $2, $3)`,
      [serverId, data.mapName, data.mode]
    );
  }
}

// Get all servers with their latest stats
export async function getAllServersWithHistory(hoursBack: number = 36): Promise<ServerWithHistory[]> {
    const request = query(`
        WITH latest_motds AS (SELECT DISTINCT ON (server_id) server_id,
                                                             server_name as "serverName",
                                                             description,
                                                             mode_name   as "modeName",
                                                             valid_from
                              FROM server_motds
                              WHERE valid_to IS NULL
                              ORDER BY server_id, valid_from DESC),
             latest_maps AS (SELECT DISTINCT ON (server_id) server_id,
                                                            map_name  as "mapName",
                                                            game_mode as mode,
                                                            valid_from
                             FROM server_maps
                             WHERE valid_to IS NULL
                             ORDER BY server_id, valid_from DESC),
             latest_stats AS (SELECT DISTINCT ON (server_id) server_id,
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
             history_data AS (SELECT server_id,
                                     json_agg(
                                             json_build_object(
                                                     'timestamp', extract(epoch from timestamp) * 1000,
                                                     'players', players
                                             )
                                             ORDER BY timestamp
                                     ) as history_json
                              FROM server_stats
                              WHERE timestamp > NOW() - interval '${hoursBack} hours'
                              GROUP BY server_id)
        SELECT s.id,
               s.name,
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
        ORDER BY s.name, s.host, s.port
    `);

    const [result] = await Promise.all([request]);

    return result.rows.map(row => {
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

// Get detailed information about a specific server
export async function getServer(
    serverId: number
): Promise<ServerWithHistory & ServerDetails | undefined> {
    const qry = query(`
    WITH current_server AS (
      SELECT id, name, host, port, updated_at
      FROM servers
      WHERE id = $1
    ),
    latest_stats AS (
      SELECT players, max_players as "playerLimit", wave,
             version, version_type as "versionType", 
             ping, online, timestamp
      FROM server_stats
      WHERE server_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    ),
    latest_motd AS (
      SELECT server_name as "serverName", description, mode_name as "modeName"
      FROM server_motds
      WHERE server_id = $1 AND valid_to IS NULL
      ORDER BY valid_from DESC
      LIMIT 1
    ),
    latest_map AS (
      SELECT map_name as "mapName", game_mode as mode
      FROM server_maps
      WHERE server_id = $1 AND valid_to IS NULL
      ORDER BY valid_from DESC
      LIMIT 1
    ),
    map_history AS (
      SELECT json_agg(
        json_build_object(
          'timestamp', extract(epoch from valid_from) * 1000,
          'mapName', map_name,
          'gameMode', game_mode
        )
        ORDER BY valid_from DESC
      ) as map_history_json
      FROM server_maps
      WHERE server_id = $1
      GROUP BY server_id
      LIMIT 50
    ),
    motd_history AS (
      SELECT json_agg(
        json_build_object(
          'timestamp', extract(epoch from valid_from) * 1000,
          'name', server_name,
          'motd', description,
          'modeName', mode_name
        )
        ORDER BY valid_from DESC
      ) as motd_history_json
      FROM server_motds
      WHERE server_id = $1
      GROUP BY server_id
      LIMIT 50
    ),
    player_peaks AS (
      SELECT 
        MAX(players) as all_time_peak,
        (SELECT timestamp FROM server_stats 
         WHERE server_id = $1 AND players = (SELECT MAX(players) FROM server_stats WHERE server_id = $1)
         ORDER BY timestamp DESC LIMIT 1) as all_time_peak_date,
        (SELECT MAX(players) FROM server_stats 
         WHERE server_id = $1 AND timestamp > NOW() - interval '24 hours') as daily_peak,
        (SELECT MAX(players) FROM server_stats 
         WHERE server_id = $1 AND timestamp > NOW() - interval '7 days') as weekly_peak
      FROM server_stats
      WHERE server_id = $1
    ),
    uptime_stats AS (
      SELECT 
        (COUNT(CASE WHEN online = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as last_24h_uptime,
        (SELECT (COUNT(CASE WHEN online = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) 
         FROM server_stats 
         WHERE server_id = $1 AND timestamp > NOW() - interval '7 days') as last_7d_uptime
      FROM server_stats
      WHERE server_id = $1 AND timestamp > NOW() - interval '24 hours'
    )
    SELECT 
      s.id, s.name, s.host, s.port, s.updated_at as "lastUpdated",
      st.online, st.timestamp, st.players, st."playerLimit", st.wave,
      st.version, st."versionType", st.ping,
      m."serverName", m.description, m."modeName",
      map."mapName", map.mode,
      COALESCE(mh.map_history_json, '[]'::json) as map_history,
      COALESCE(mth.motd_history_json, '[]'::json) as motd_history,
      p.all_time_peak, p.all_time_peak_date,
      p.daily_peak, p.weekly_peak,
      u.last_24h_uptime, u.last_7d_uptime
    FROM current_server s
    LEFT JOIN latest_stats st ON true
    LEFT JOIN latest_motd m ON true
    LEFT JOIN latest_map map ON true
    LEFT JOIN map_history mh ON true
    LEFT JOIN motd_history mth ON true
    LEFT JOIN player_peaks p ON true
    LEFT JOIN uptime_stats u ON true
  `, [serverId]);

    const [result] = await Promise.all([qry]);

    if (result.rows.length === 0) {
        return undefined;
    }

    const row = result.rows[0];

    const serverWithDetails: ServerWithHistory & ServerDetails = {
        id: row.id,
        name: row.name,
        host: row.host,
        port: row.port,
        history: [],
        online: row.online || false,
        lastUpdated: row.lastUpdated?.getTime() || Date.now(),
        mapHistory: row.map_history || [],
        motdHistory: row.motd_history || [],
        playerPeaks: {
            allTime: row.all_time_peak || 0,
            allTimeDate: row.all_time_peak_date || new Date(),
            daily: row.daily_peak || 0,
            weekly: row.weekly_peak || 0
        },
        uptime: {
            last24h: parseFloat(row.last_24h_uptime) || 0,
            last7d: parseFloat(row.last_7d_uptime) || 0
        }
    };

    // Add current data if we have stats
    if (row.timestamp) {
        serverWithDetails.currentData = {
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

    return serverWithDetails;
}
