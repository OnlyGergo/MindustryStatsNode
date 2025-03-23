import express from 'express';
import { query } from '../config/database';
import {getServer} from "../repositories/serverRepository";

const router = express.Router();

// Get server by address
router.get('/servers/:id/details', async (req, res) => {
  const { id } = req.params;
  const idNumber = parseInt(id, 10);
  
  if (isNaN(idNumber)) {
    res.status(400).json({ error: 'Invalid ID number' });
    return;
  }
  
  const server = await getServer(idNumber);
  
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }
  
  res.json(server);
});

// Get MOTD history for a server
router.get('/servers/:id/motd-history', async (req, res) => {
  const { id } = req.params;
  const idNumber = parseInt(id, 10);

  if (isNaN(idNumber)) {
    res.status(400).json({ error: 'Invalid ID number' });
    return;
  }
  
  try {
    // Get MOTD history with time periods
    const result = await query(
      `SELECT 
        server_name, description, mode_name, 
        valid_from, valid_to
       FROM server_motds 
       WHERE server_id = $1 
       ORDER BY valid_from DESC`,
      [idNumber]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch MOTD history:', err);
    res.status(500).json({ error: 'Failed to fetch MOTD history' });
  }
});

// Get map history for a server
router.get('/servers/:id/map-history', async (req, res) => {
  const { id } = req.params;
  const idNumber = parseInt(id, 10);

  if (isNaN(idNumber)) {
    res.status(400).json({ error: 'Invalid ID number' });
    return;
  }

  try {
    // Get map history with time periods
    const result = await query(
      `SELECT 
        map_name, game_mode,
        valid_from, valid_to
       FROM server_maps 
       WHERE server_id = $1 
       ORDER BY valid_from DESC`,
      [idNumber]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch map history:', err);
    res.status(500).json({ error: 'Failed to fetch map history' });
  }
});

export default router;