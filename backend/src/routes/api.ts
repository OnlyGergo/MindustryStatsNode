import express from 'express';
import {getMapHistory, getMotdHistory, getServer} from "../repositories/serverRepository";
import {createLogger} from "../logger";

const logger = createLogger("API");
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
    res.json(getMotdHistory(idNumber));
  } catch (err) {
    logger.error('Failed to fetch MOTD history:', err);
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
    res.json(getMapHistory(idNumber));
  } catch (err) {
    logger.error('Failed to fetch map history:', err);
    res.status(500).json({ error: 'Failed to fetch map history' });
  }
});

export default router;