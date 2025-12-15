#!/usr/bin/env node

import { createLogger } from './logger';
import { initDatabase } from './config/database';
import { InMemoryQueue, InMemoryPubSub, InMemoryCache } from './utils/in-memory-queue';
import { QUEUES, CHANNELS, CACHE_KEYS, CACHE_TTL, SERVICES } from './shared/constants';
import { loadBaseConfig, ServerDiscoveryConfig, ServerCollectorConfig, ServerProcessorConfig, ApiServiceConfig, WebSocketServiceConfig } from './shared/config';
import { SERVERS_SOURCE } from './const';
import * as serverRepository from './repositories/serverRepository';
import { ServerListElement } from './models/ServerListElement';
import { getServerData } from './services/mindustryService';
import { ServerData, ServerWithHistory } from '../../common/models/serverData';
import express from 'express';
import cors from 'cors';
import http from 'http';
import WebSocket from 'ws';
import PQueue from 'p-queue';
import os from 'os';

const logger = createLogger('UnifiedApp');

interface RawServerData {
  host: string;
  port: number;
  networkName?: string;
  data: ServerData | null;
  timestamp: number;
  online: boolean;
  error?: string;
}

/**
 * Extended WebSocket interface with connection tracking
 */
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
}

/**
 * Calculate default collection concurrency based on CPU cores
 */
function getDefaultConcurrency(): number {
  return Math.max(4, Math.floor(os.cpus().length * 1.5));
}

/**
 * Unified Mindustry Stats Application
 * Combines all microservices into a single process
 * Uses p-queue for concurrency control instead of Redis queues
 */
class MindustryStatsApp {
  // Configuration
  private discoveryConfig: ServerDiscoveryConfig;
  private collectorConfig: ServerCollectorConfig;
  private processorConfig: ServerProcessorConfig;
  private apiConfig: ApiServiceConfig;
  private wsConfig: WebSocketServiceConfig;

  // In-memory queues and cache
  private discoveryQueue: InMemoryQueue<any>;
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private updatesPubSub: InMemoryPubSub;

  // p-queue for server collection concurrency control
  private collectionQueue: PQueue;

  // Server data storage
  private serverDataCache: Map<string, ServerWithHistory> = new Map();

  // Express app and servers
  private app!: express.Application;
  private httpServer!: http.Server;
  private wsServer!: WebSocket.Server;
  private wsClients: Set<ExtendedWebSocket> = new Set();

  // Service control
  private running = false;

  constructor() {
    // Load configurations
    const baseConfig = loadBaseConfig();
    
    this.discoveryConfig = {
      ...baseConfig,
      SERVER_LIST_INTERVAL_MS: parseInt(process.env.SERVER_LIST_INTERVAL_MS || '86400000') // 24 hours
    };

    this.collectorConfig = {
      ...baseConfig,
      COLLECTION_CONCURRENCY: parseInt(process.env.COLLECTION_CONCURRENCY || getDefaultConcurrency().toString()),
      MINDUSTRY_TIMEOUT_MS: parseInt(process.env.MINDUSTRY_TIMEOUT_MS || '1000'),
      QUEUE_POLL_TIMEOUT: parseInt(process.env.QUEUE_POLL_TIMEOUT || '5')
    };

    this.processorConfig = {
      ...baseConfig,
      MAX_HISTORY_HOURS: parseInt(process.env.MAX_HISTORY_HOURS || '36'),
      MAX_HISTORY_POINTS: parseInt(process.env.MAX_HISTORY_POINTS || '864'),
      QUEUE_POLL_TIMEOUT: parseInt(process.env.QUEUE_POLL_TIMEOUT || '5')
    };

    this.apiConfig = {
      ...baseConfig,
      PORT: parseInt(process.env.API_PORT || '3000'),
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
    };

    this.wsConfig = {
      ...baseConfig,
      PORT: parseInt(process.env.WS_PORT || '3001'),
      WS_PATH: process.env.WS_PATH || '/ws',
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
    };

    // Initialize in-memory queues and cache
    this.discoveryQueue = new InMemoryQueue(QUEUES.SERVER_DISCOVERY);
    this.rawDataQueue = new InMemoryQueue(QUEUES.SERVER_INFO_RAW);
    this.cache = new InMemoryCache();
    this.updatesPubSub = new InMemoryPubSub(CHANNELS.SERVER_UPDATES);

    // Initialize p-queue for server collection with concurrency control
    this.collectionQueue = new PQueue({
      concurrency: this.collectorConfig.COLLECTION_CONCURRENCY,
      interval: 1000,
      intervalCap: this.collectorConfig.COLLECTION_CONCURRENCY * 2
    });
  }

  /**
   * Start the unified application
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting Mindustry Stats Application...');

      // Initialize database
      await initDatabase();

      // Initialize data storage
      await this.initDataStorage();

      // Start all services
      await this.startServerDiscovery();
      await this.startServerCollector();
      await this.startServerProcessor();
      await this.startApiService();
      await this.startWebSocketService();

      // Start periodic cache cleanup
      this.startCacheCleanup();

      this.running = true;
      logger.info('Mindustry Stats Application started successfully');
      logger.info(`- API Service: http://localhost:${this.apiConfig.PORT}`);
      logger.info(`- WebSocket Service: ws://localhost:${this.wsConfig.PORT}${this.wsConfig.WS_PATH}`);
      logger.info(`- Collection Concurrency: ${this.collectorConfig.COLLECTION_CONCURRENCY}`);
      logger.info(`- PID: ${process.pid}`);

      // Handle graceful shutdown
      this.setupShutdownHandlers();

    } catch (error) {
      logger.error('Failed to start application:', error);
      throw error;
    }
  }

  /**
   * Initialize server data cache from database
   */
  private async initDataStorage(): Promise<void> {
    try {
      logger.info('Initializing data storage...');

      const servers = await serverRepository.getAllServersWithHistory(this.processorConfig.MAX_HISTORY_HOURS);

      this.serverDataCache.clear();

      for (const server of servers) {
        const serverKey = `${server.host}:${server.port}`;
        server.online = false;
        if (server.currentData) {
          server.currentData.online = false;
        }
        this.serverDataCache.set(serverKey, server);
      }

      await this.cache.set(CACHE_KEYS.ALL_SERVERS, Array.from(this.serverDataCache.values()), CACHE_TTL.ALL_SERVERS);

      logger.info(`Initialized data storage with ${this.serverDataCache.size} servers`);

    } catch (error) {
      logger.error('Failed to initialize data storage:', error);
      throw error;
    }
  }

  /**
   * Start Server Discovery Service
   * Periodically fetches server lists and queues them for collection
   */
  private async startServerDiscovery(): Promise<void> {
    logger.info('Starting Server Discovery Service...');

    // Initial server list refresh
    await this.refreshServerList();
    await this.queueAllServersForCollection();

    // Schedule periodic server list refresh (daily)
    setInterval(async () => {
      try {
        await this.refreshServerList();
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.discoveryConfig.SERVER_LIST_INTERVAL_MS);

    // Schedule periodic server collection queuing (every 5 minutes)
    const DATA_COLLECTION_INTERVAL = parseInt(process.env.DATA_COLLECTION_INTERVAL_MS || '300000');
    setInterval(async () => {
      try {
        await this.queueAllServersForCollection();
      } catch (error) {
        logger.error('Error in scheduled server collection queuing:', error);
      }
    }, DATA_COLLECTION_INTERVAL);

    logger.info(`Server Discovery Service started`);
    logger.info(`- Server list refresh: every ${this.discoveryConfig.SERVER_LIST_INTERVAL_MS / 1000} seconds`);
    logger.info(`- Server collection queuing: every ${DATA_COLLECTION_INTERVAL / 1000} seconds`);
  }

  /**
   * Refresh server list from all sources
   */
  private async refreshServerList(): Promise<void> {
    let groupsCount = 0;
    const startTime = Date.now();
    logger.info('Refreshing servers...');

    try {
      for (const url of SERVERS_SOURCE) {
        logger.info(`Fetching servers from: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
          logger.warn(`Failed to fetch from ${url}: ${response.statusText}`);
          continue;
        }

        const servers: ServerListElement[] = await response.json();
        groupsCount += servers.length;

        await serverRepository.ensureServers(servers);

        for (const serverGroup of servers) {
          for (const address of serverGroup.address) {
            let host: string;
            let port: number;

            if (address.includes(':')) {
              const [hostPart, portPart] = address.split(':');
              host = hostPart.trim();
              port = parseInt(portPart) || 6567;
            } else {
              host = address.trim();
              port = 6567;
            }

            await this.discoveryQueue.push({
              host: host,
              port: port,
              networkName: serverGroup.name,
              timestamp: Date.now()
            });
          }
        }
      }

      const timeTaken = (Date.now() - startTime) / 1000;
      logger.info(`Found ${groupsCount} total server groups in ${timeTaken.toFixed(2)} seconds.`);

    } catch (error) {
      logger.error('Error refreshing server list:', error);
      throw error;
    }
  }

  /**
   * Queue all servers for collection
   */
  private async queueAllServersForCollection(): Promise<void> {
    const startTime = Date.now();
    logger.info('Queuing all servers for collection...');

    try {
      const allServers = await serverRepository.getServers();

      let queuedCount = 0;
      for (const server of allServers) {
        await this.discoveryQueue.push({
          host: server.host,
          port: server.port,
          networkName: server.name,
          timestamp: Date.now()
        });
        queuedCount++;
      }

      const timeTaken = (Date.now() - startTime) / 1000;
      logger.info(`Queued ${queuedCount} servers for collection in ${timeTaken.toFixed(2)} seconds.`);

    } catch (error) {
      logger.error('Error queuing servers for collection:', error);
      throw error;
    }
  }

  /**
   * Start Server Collector Service
   * Uses p-queue to process discovery queue with concurrency control
   */
  private async startServerCollector(): Promise<void> {
    logger.info('Starting Server Collector Service...');

    // Start workers that continuously process the discovery queue
    for (let i = 0; i < this.collectorConfig.COLLECTION_CONCURRENCY; i++) {
      this.collectorWorker(i + 1);
    }

    logger.info(`Server Collector Service started with ${this.collectorConfig.COLLECTION_CONCURRENCY} workers`);
  }

  /**
   * Worker that processes discovery queue using p-queue
   */
  private async collectorWorker(workerId: number): Promise<void> {
    logger.info(`Collector Worker ${workerId} started`);

    while (this.running) {
      try {
        const discoveryData = await this.discoveryQueue.pop(this.collectorConfig.QUEUE_POLL_TIMEOUT);

        if (discoveryData) {
          // Use p-queue to control concurrency
          await this.collectionQueue.add(async () => {
            await this.processServerDiscovery(discoveryData);
          });
        }

      } catch (error) {
        logger.error(`Worker ${workerId} error:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Collector Worker ${workerId} stopped`);
  }

  /**
   * Process a single server discovery request
   */
  private async processServerDiscovery(discoveryData: { host: string; port: number; networkName?: string; timestamp: number }): Promise<void> {
    const { host, port, networkName } = discoveryData;
    const serverKey = `${host}:${port}`;

    try {
      logger.debug(`Querying server: ${serverKey} (${networkName || 'Unknown Network'})`);

      const serverData = await getServerData(host, port);

      const rawData: RawServerData = {
        host,
        port,
        networkName,
        data: serverData,
        timestamp: Date.now(),
        online: serverData !== null
      };

      const cacheKey = CACHE_KEYS.SERVER_DATA(host, port);
      await this.cache.set(cacheKey, rawData, CACHE_TTL.SERVER_DATA);

      await this.rawDataQueue.push(rawData);

      if (serverData) {
        logger.debug(`Successfully queried ${serverKey} (${networkName}): ${serverData.players}/${serverData.playerLimit} players`);
      } else {
        logger.debug(`Server ${serverKey} (${networkName}) is offline or unreachable`);
      }

    } catch (error) {
      logger.warn(`Error processing server ${serverKey} (${networkName || 'Unknown'}):`, error);

      const rawData: RawServerData = {
        host,
        port,
        networkName,
        data: null,
        timestamp: Date.now(),
        online: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      await this.rawDataQueue.push(rawData);
    }
  }

  /**
   * Start Server Processor Service
   * Processes raw server data and updates cache/database
   */
  private async startServerProcessor(): Promise<void> {
    logger.info('Starting Server Processor Service...');

    this.processorLoop();

    logger.info('Server Processor Service started');
  }

  /**
   * Main processing loop for server data
   */
  private async processorLoop(): Promise<void> {
    logger.info('Starting processing loop...');

    let cacheUpdateCounter = 0;
    const CACHE_UPDATE_INTERVAL = 60;

    while (this.running) {
      try {
        const rawData = await this.rawDataQueue.pop(this.processorConfig.QUEUE_POLL_TIMEOUT);

        if (rawData) {
          await this.processRawServerData(rawData);
          cacheUpdateCounter++;

          if (cacheUpdateCounter >= CACHE_UPDATE_INTERVAL) {
            await this.updateComprehensiveCache();
            cacheUpdateCounter = 0;
          }
        }

      } catch (error) {
        logger.error('Error in processing loop:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Processing loop stopped');
  }

  /**
   * Process raw server data
   */
  private async processRawServerData(rawData: RawServerData): Promise<void> {
    const { host, port, data, timestamp, online } = rawData;
    const serverKey = `${host}:${port}`;

    try {
      let serverEntry = this.serverDataCache.get(serverKey);

      if (!serverEntry) {
        const servers = await serverRepository.getServers();
        const dbServer = servers.find(s => s.host === host && s.port === port);

        if (!dbServer) {
          logger.warn(`Server ${serverKey} not found in database, skipping processing`);
          return;
        }

        serverEntry = {
          id: dbServer.id,
          name: dbServer.name,
          host: dbServer.host,
          port: dbServer.port,
          history: [],
          lastSeen: timestamp,
          lastUpdated: timestamp,
          online: false,
          consecutiveFailures: 0
        };

        this.serverDataCache.set(serverKey, serverEntry);
      }

      if (data && online) {
        await serverRepository.saveServerStats(serverEntry.id, data);
        await serverRepository.saveMotdIfChanged(serverEntry.id, data);
        await serverRepository.saveMapIfChanged(serverEntry.id, data);

        serverEntry.currentData = data;
        serverEntry.lastUpdated = timestamp;
        serverEntry.lastSeen = timestamp;
        serverEntry.online = true;
        serverEntry.consecutiveFailures = 0;

        serverEntry.history.push({
          timestamp,
          players: data.players ?? 0
        });

        if (serverEntry.history.length > this.processorConfig.MAX_HISTORY_POINTS) {
          serverEntry.history = serverEntry.history.slice(-this.processorConfig.MAX_HISTORY_POINTS);
        }

        logger.debug(`Updated server ${serverKey}: ${data.players}/${data.playerLimit} players`);

      } else {
        serverEntry.online = false;
        serverEntry.lastUpdated = timestamp;
        serverEntry.consecutiveFailures = (serverEntry.consecutiveFailures || 0) + 1;

        await serverRepository.saveServerStats(serverEntry.id, {
          ping: null,
          host: host,
          port: port,
          serverName: null,
          mapName: null,
          players: null,
          wave: null,
          version: null,
          versionType: null,
          mode: null,
          playerLimit: null,
          description: null,
          modeName: null,
          online: false,
        });

        logger.debug(`Server ${serverKey} marked as offline`);
      }

      const serverCacheKey = CACHE_KEYS.SERVER_DATA(host, port);
      await this.cache.set(serverCacheKey, serverEntry, CACHE_TTL.SERVER_DATA);

      await this.updatesPubSub.publish({
        type: 'server_update',
        server: serverEntry,
        timestamp: timestamp
      });

    } catch (error) {
      logger.error(`Error processing server data for ${serverKey}:`, error);
    }
  }

  /**
   * Update the comprehensive server cache
   */
  private async updateComprehensiveCache(): Promise<void> {
    try {
      const allServers = Array.from(this.serverDataCache.values());
      await this.cache.set(CACHE_KEYS.ALL_SERVERS, allServers, CACHE_TTL.ALL_SERVERS);
      logger.debug(`Updated comprehensive cache with ${allServers.length} servers`);
    } catch (error) {
      logger.error('Error updating comprehensive cache:', error);
    }
  }

  /**
   * Start API Service
   */
  private async startApiService(): Promise<void> {
    logger.info('Starting API Service...');

    this.app = express();

    this.app.use(cors({
      origin: this.apiConfig.CORS_ORIGIN,
      credentials: true
    }));
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      res.json({
        status: 'healthy',
        service: 'mindustry-stats',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        serverCount: this.serverDataCache.size,
        queueLengths: {
          discovery: await this.discoveryQueue.length(),
          rawData: await this.rawDataQueue.length()
        },
        collectionQueue: {
          size: this.collectionQueue.size,
          pending: this.collectionQueue.pending
        }
      });
    });

    // API Routes
    this.app.get('/api/servers/:id/details', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const server = await this.getServerDetails(idNumber);

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        logger.debug(`Served server details for ID ${idNumber}`);
        res.json(server);

      } catch (error) {
        logger.error('Error fetching server details:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/api/servers/:id/motd-history', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMotdHistory(idNumber);

        logger.debug(`Served MOTD history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch MOTD history:', error);
        res.status(500).json({ error: 'Failed to fetch MOTD history' });
      }
    });

    this.app.get('/api/servers/:id/map-history', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMapHistory(idNumber);

        logger.debug(`Served map history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch map history:', error);
        res.status(500).json({ error: 'Failed to fetch map history' });
      }
    });

    this.app.get('/api/servers', async (req, res) => {
      try {
        const servers = await this.cache.get(CACHE_KEYS.ALL_SERVERS);

        if (!servers) {
          res.status(503).json({ error: 'Server data not available' });
          return;
        }

        logger.debug(`Served ${servers.length} servers from cache`);
        res.json(servers);

      } catch (error) {
        logger.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Start HTTP server
    await new Promise<void>((resolve, reject) => {
      this.httpServer = this.app.listen(this.apiConfig.PORT, () => {
        logger.info(`API Service HTTP server started on port ${this.apiConfig.PORT}`);
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  /**
   * Get server details with caching
   */
  private async getServerDetails(id: number) {
    const cacheKey = CACHE_KEYS.SERVER_DETAILS(id);

    let server = await this.cache.get(cacheKey);

    if (!server) {
      server = await serverRepository.getServer(id);

      if (server) {
        await this.cache.set(cacheKey, server, CACHE_TTL.SERVER_DETAILS);
      }
    }

    return server;
  }

  /**
   * Get MOTD history with caching
   */
  private async getServerMotdHistory(id: number) {
    const cacheKey = CACHE_KEYS.MOTD_HISTORY(id);

    let history = await this.cache.get(cacheKey);

    if (!history) {
      history = await serverRepository.getMotdHistory(id);

      if (history) {
        await this.cache.set(cacheKey, history, CACHE_TTL.HISTORY);
      }
    }

    return history;
  }

  /**
   * Get map history with caching
   */
  private async getServerMapHistory(id: number) {
    const cacheKey = CACHE_KEYS.MAP_HISTORY(id);

    let history = await this.cache.get(cacheKey);

    if (!history) {
      history = await serverRepository.getMapHistory(id);

      if (history) {
        await this.cache.set(cacheKey, history, CACHE_TTL.HISTORY);
      }
    }

    return history;
  }

  /**
   * Start WebSocket Service
   */
  private async startWebSocketService(): Promise<void> {
    logger.info('Starting WebSocket Service...');

    const wsHttpServer = http.createServer();

    this.wsServer = new WebSocket.Server({
      server: wsHttpServer,
      path: this.wsConfig.WS_PATH,
      verifyClient: (info: { origin: string }) => {
        if (this.wsConfig.CORS_ORIGIN === '*') {
          return true;
        }
        const origin = info.origin;
        return origin === this.wsConfig.CORS_ORIGIN;
      }
    });

    this.wsServer.on('connection', (ws: ExtendedWebSocket) => {
      ws.isAlive = true;
      this.registerWebSocketClient(ws);
    });

    // Subscribe to server updates
    await this.updatesPubSub.subscribe((updateData: any) => {
      this.broadcastUpdate({
        type: 'server_update',
        data: updateData,
        timestamp: Date.now()
      });
    });

    // Start connection health check
    this.startConnectionHealthCheck();

    await new Promise<void>((resolve, reject) => {
      wsHttpServer.listen(this.wsConfig.PORT, () => {
        logger.info(`WebSocket server started on port ${this.wsConfig.PORT}${this.wsConfig.WS_PATH}`);
        resolve();
      });

      wsHttpServer.on('error', reject);
    });
  }

  /**
   * Register a new WebSocket client
   */
  private async registerWebSocketClient(client: ExtendedWebSocket): Promise<void> {
    try {
      this.wsClients.add(client);
      logger.info(`WebSocket connected, total clients: ${this.wsClients.size}`);

      const initialData = await this.cache.get(CACHE_KEYS.ALL_SERVERS);

      if (initialData) {
        client.send(JSON.stringify({
          type: 'init',
          data: initialData,
          timestamp: Date.now()
        }));
        logger.debug('Sent initial data to new WebSocket client');
      }

      client.on('close', () => {
        this.wsClients.delete(client);
        logger.info(`WebSocket disconnected, total clients: ${this.wsClients.size}`);
      });

      client.on('error', (error) => {
        logger.warn('WebSocket client error:', error);
        this.wsClients.delete(client);
      });

      client.on('pong', () => {
        client.isAlive = true;
      });

    } catch (error) {
      logger.error('Error registering WebSocket client:', error);
      client.close();
    }
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(data: any): void {
    if (this.wsClients.size === 0) {
      return;
    }

    const message = JSON.stringify(data);
    let successCount = 0;
    let errorCount = 0;

    for (const client of this.wsClients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
          successCount++;
        } else {
          this.wsClients.delete(client);
        }
      } catch (error) {
        logger.warn('Error sending message to WebSocket client:', error);
        this.wsClients.delete(client);
        errorCount++;
      }
    }

    if (successCount > 0) {
      logger.debug(`Broadcasted update to ${successCount} clients`);
    }
    if (errorCount > 0) {
      logger.warn(`Failed to send to ${errorCount} clients`);
    }
  }

  /**
   * Start periodic health check for WebSocket connections
   */
  private startConnectionHealthCheck(): void {
    setInterval(() => {
      const deadClients: ExtendedWebSocket[] = [];

      for (const client of this.wsClients) {
        if (client.isAlive === false) {
          deadClients.push(client);
          continue;
        }

        client.isAlive = false;

        try {
          client.ping();
        } catch (error) {
          deadClients.push(client);
        }
      }

      for (const client of deadClients) {
        this.wsClients.delete(client);
        try {
          client.terminate();
        } catch (error) {
          // Ignore errors when terminating already dead connections
        }
      }

      if (deadClients.length > 0) {
        logger.info(`Removed ${deadClients.length} dead WebSocket connections`);
      }

    }, 30000); // Check every 30 seconds
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cache.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      this.running = false;

      // Close WebSocket server
      for (const client of this.wsClients) {
        try {
          client.close(1000, 'Server shutting down');
        } catch (error) {
          // Ignore errors during shutdown
        }
      }

      if (this.wsServer) {
        this.wsServer.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close();
      }

      // Final cache update
      try {
        await this.updateComprehensiveCache();
      } catch (error) {
        logger.error('Error during final cache update:', error);
      }

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Create and start the application
const app = new MindustryStatsApp();
app.start().catch((error) => {
  logger.error('Fatal error starting application:', error);
  process.exit(1);
});
