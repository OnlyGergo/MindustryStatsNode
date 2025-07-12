import express from 'express';
import path from 'path';
import http from 'http';
import WebSocket from 'ws';
import {
  initDataStorage,
  registerWebSocketClient
} from './services/dataCollector';
import apiRoutes from './routes/api';
import { initDatabase } from './config/database';
import {createLogger} from "./logger";
import {initSchedules} from "./services/schedules";
const logger = createLogger("Web Server");

export async function createServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server: server, path: "/ws" });

  // Static files
  app.use(express.static(path.join(process.cwd(), 'public')));

  // API routes
  app.use('/api', apiRoutes);

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    logger.info('WS Connected, total: ' + wss.clients.size);
    registerWebSocketClient(ws);
  });
  
  // Initialize database connection
  await initDatabase();

  // Initialize data storage
  await initDataStorage();

  // Start all schedules, like list updating and the server info collection
  await initSchedules();

  return server;
}