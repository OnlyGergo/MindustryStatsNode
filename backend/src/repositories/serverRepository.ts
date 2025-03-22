import { query } from '../config/database';
import { ServerConfig, ServerData, ServerHistory, ServerWithHistory } from '../../../common/models/serverData';

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
}): Promise<ServerRecord> {
  const result = await query(
    `INSERT INTO servers (name, host, port) 
     VALUES ($1, $2, $3)
     ON CONFLICT (host, port) 
     DO UPDATE SET name = $1, updated_at = NOW()
     RETURNING *`,
    [config.name, config.host, config.port]
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
    lastMap.map_name !== data.mapName ||
    lastMap.game_mode !== data.mode;
  
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
export async function getAllServers(hoursBack: number = 24): Promise<ServerWithHistory[]> {
  const result = await query(`
    WITH latest_stats AS (
      SELECT DISTINCT ON (server_id) 
        server_id,
        timestamp,
        players,
        max_players as "playerLimit",
        wave,
        version,
        version_type as "versionType",
        ping,
        online
      FROM server_stats
      ORDER BY server_id, timestamp DESC
    ),
    latest_motds AS (
      SELECT DISTINCT ON (server_id)
        server_id,
        server_name as "serverName",
        description,
        mode_name as "modeName",
        valid_from
      FROM server_motds
      WHERE valid_to IS NULL
      ORDER BY server_id, valid_from DESC
    ),
    latest_maps AS (
      SELECT DISTINCT ON (server_id)
        server_id,
        map_name as "mapName",
        game_mode as mode,
        valid_from
      FROM server_maps
      WHERE valid_to IS NULL
      ORDER BY server_id, valid_from DESC
    )
    SELECT 
      s.id,
      s.name,
      s.host,
      s.port,
      s.updated_at as "lastUpdated",
      stats.online,
      stats.timestamp,
      stats.players,
      stats."playerLimit",
      stats.wave,
      stats.version,
      stats."versionType",
      stats.ping,
      motds."serverName",
      motds.description,
      motds."modeName",
      maps."mapName",
      maps.mode
    FROM servers s
    LEFT JOIN latest_stats stats ON s.id = stats.server_id
    LEFT JOIN latest_motds motds ON s.id = motds.server_id
    LEFT JOIN latest_maps maps ON s.id = maps.server_id
    ORDER BY s.name, s.host, s.port
  `);
  
  return result.rows.map(row => {
    const serverWithHistory: ServerWithHistory = {
      name: row.name,
      host: row.host,
      port: row.port,
      history: [], // Will be populated separately
      online: row.online || false,
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

// Get server history for a specific server within a time range
export async function getServerHistory(
  serverId: number,
  hoursBack: number = 24
): Promise<ServerHistory[]> {
  const result = await query(
    `SELECT timestamp, players
     FROM server_stats
     WHERE server_id = $1
       AND timestamp > NOW() - interval '${hoursBack} hours'
     ORDER BY timestamp ASC`,
    [serverId]
  );
  
  return result.rows.map(row => ({
    timestamp: row.timestamp.getTime(),
    players: row.players
  }));
}

// Get server by host and port
export async function getServerByAddress(
  host: string,
  port: number
): Promise<ServerWithHistory | undefined> {
  const servers = await query(
    `SELECT id, name, host, port
     FROM servers
     WHERE host = $1 AND port = $2`,
    [host, port]
  );
  
  if (servers.rows.length === 0) {
    return undefined;
  }
  
  const server = servers.rows[0];
  
  // Get latest stats
  const statsResult = await query(
    `SELECT players, max_players as "playerLimit", wave,
            version, version_type as "versionType", 
            ping, online, timestamp
     FROM server_stats
     WHERE server_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [server.id]
  );
  
  // Get latest MOTD
  const motdResult = await query(
    `SELECT server_name as "serverName", description, mode_name as "modeName"
     FROM server_motds
     WHERE server_id = $1 AND valid_to IS NULL
     ORDER BY valid_from DESC
     LIMIT 1`,
    [server.id]
  );
  
  // Get latest map
  const mapResult = await query(
    `SELECT map_name as "mapName", game_mode as mode
     FROM server_maps
     WHERE server_id = $1 AND valid_to IS NULL
     ORDER BY valid_from DESC
     LIMIT 1`,
    [server.id]
  );
  
  // Get history
  const history = await getServerHistory(server.id);
  
  const serverWithHistory: ServerWithHistory = {
    name: server.name,
    host: server.host,
    port: server.port,
    history,
    online: statsResult.rows[0]?.online || false,
    lastUpdated: statsResult.rows[0]?.timestamp?.getTime() || Date.now()
  };
  
  // Combine stats, MOTD, and map if available
  if (statsResult.rows.length > 0) {
    const stats = statsResult.rows[0];
    const motd = motdResult.rows[0] || {};
    const map = mapResult.rows[0] || {};
    
    serverWithHistory.currentData = {
      ping: stats.ping || 0,
      host: server.host,
      port: server.port,
      serverName: motd.serverName || 'Unknown',
      mapName: map.mapName || 'Unknown',
      players: stats.players || 0,
      wave: stats.wave || 0,
      version: stats.version || 0,
      versionType: stats.versionType || 'Unknown',
      mode: map.mode || 0,
      playerLimit: stats.playerLimit || 0,
      description: motd.description || '',
      modeName: motd.modeName || '',
      online: stats.online || false
    };
  }
  
  return serverWithHistory;
}