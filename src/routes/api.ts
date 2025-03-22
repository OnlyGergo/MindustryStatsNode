import { Router } from 'express';
import { getServerData, getServerByAddress } from '../services/dataCollector';

const router = Router();

router.get('/servers', (req, res) => {
  const servers = getServerData();
  res.json(servers);
});

router.get('/servers/:host/:port', (req, res) => {
  const { host, port } = req.params;
  const server = getServerByAddress(host, parseInt(port, 10));
  
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }
  
  res.json(server);
});

export default router;