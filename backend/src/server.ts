import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import http from 'http';
import WebSocket from 'ws';
import {
  collectServerData,
  initDataStorage,
  registerWebSocketClient,
  onServerUpdate
} from './services/dataCollector';
import apiRoutes from './routes/api';
import { initDatabase } from './config/database';

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
    console.log('WebSocket client connected');
    registerWebSocketClient(ws);
  });
  
  // Initialize database connection
  await initDatabase();

  // Initialize data storage
  await initDataStorage();

  // Start data collection
  try {
    // Initial data collection
    collectServerData().catch(err =>
      console.error('Failed to collect initial server data:', err)
    );

    // Schedule periodic collection (every 5 minutes)
    const collectionInterval = 5 * 60 * 1000; // 5 minutes
    setInterval(() => {
      collectServerData().catch(err =>
          console.error('Failed to collect server data:', err)
      );
    }, collectionInterval);

    // Setup update handler
    onServerUpdate((servers) => {
      console.log(`Updated ${servers.length} servers`);
    });
  } catch (err) {
    console.error('Failed to read server list:', err);
  }

  return server;
}