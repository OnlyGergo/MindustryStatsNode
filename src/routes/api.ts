import express from 'express';
import { getServerData, getServerByAddress } from '../services/dataCollector';
import { query } from '../config/database';

const router = express.Router();

// Get all servers
router.get('/servers', (req, res) => {
  res.json(getServerData());
});

// Get server by address
router.get('/servers/:host/:port', async (req, res) => {
  const { host, port } = req.params;
  const portNumber = parseInt(port, 10);
  
  if (isNaN(portNumber)) {
    res.status(400).json({ error: 'Invalid port number' });
    return;
  }
  
  const server = await getServerByAddress(host, portNumber);
  
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }
  
  res.json(server);
});

// Get MOTD history for a server
router.get('/servers/:host/:port/motd-history', async (req, res) => {
  const { host, port } = req.params;
  const portNumber = parseInt(port, 10);
  
  if (isNaN(portNumber)) {
    res.status(400).json({ error: 'Invalid port number' });
    return;
  }
  
  try {
    // First get the server ID
    const serverResult = await query(
      'SELECT id FROM servers WHERE host = $1 AND port = $2',
      [host, portNumber]
    );
    
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    
    const serverId = serverResult.rows[0].id;
    
    // Get MOTD history with time periods
    const result = await query(
      `SELECT 
        server_name, description, mode_name, 
        valid_from, valid_to
       FROM server_motds 
       WHERE server_id = $1 
       ORDER BY valid_from DESC`,
      [serverId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch MOTD history:', err);
    res.status(500).json({ error: 'Failed to fetch MOTD history' });
  }
});

// Get map history for a server
router.get('/servers/:host/:port/map-history', async (req, res) => {
  const { host, port } = req.params;
  const portNumber = parseInt(port, 10);
  
  if (isNaN(portNumber)) {
    res.status(400).json({ error: 'Invalid port number' });
    return;
  }
  
  try {
    // First get the server ID
    const serverResult = await query(
      'SELECT id FROM servers WHERE host = $1 AND port = $2',
      [host, portNumber]
    );
    
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    
    const serverId = serverResult.rows[0].id;
    
    // Get map history with time periods
    const result = await query(
      `SELECT 
        map_name, game_mode,
        valid_from, valid_to
       FROM server_maps 
       WHERE server_id = $1 
       ORDER BY valid_from DESC`,
      [serverId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch map history:', err);
    res.status(500).json({ error: 'Failed to fetch map history' });
  }
});

export default router;