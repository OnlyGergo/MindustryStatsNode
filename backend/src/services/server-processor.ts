#!/usr/bin/env node

import { createLogger } from '../logger';
import { BaseService, ServiceHealthChecker } from '../utils/service-base';
import { ValkeyQueue, ValkeyCache, ValkeyPubSub } from '../utils/valkey';
import { loadBaseConfig, ServerProcessorConfig } from '../shared/config';
import { QUEUES, CHANNELS, CACHE_KEYS, CACHE_TTL, SERVICES } from '../shared/constants';
import { ServerData, ServerWithHistory } from '../../../common/models/serverData';
import * as serverRepository from '../repositories/serverRepository';
import { getServers } from '../repositories/serverRepository';

const logger = createLogger(SERVICES.SERVER_PROCESSOR);

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
 * Server Processor Service using BaseService pattern
 * This demonstrates data processing service architecture with PM2
 */
class ServerProcessorService extends BaseService {
  private processorConfig: ServerProcessorConfig;
  private rawDataQueue!: ValkeyQueue;
  private cache!: ValkeyCache;
  private updatesPubSub!: ValkeyPubSub;
  private serverDataCache: Map<string, ServerWithHistory> = new Map();
  private processorRunning = true;
  private healthChecker!: ServiceHealthChecker;

  constructor() {
    super(SERVICES.SERVER_PROCESSOR);
    this.processorConfig = {
      ...loadBaseConfig(),
      MAX_HISTORY_HOURS: parseInt(process.env.MAX_HISTORY_HOURS || '36'),
      MAX_HISTORY_POINTS: parseInt(process.env.MAX_HISTORY_POINTS || '864'), // 36 hours * 24 points/hour
      QUEUE_POLL_TIMEOUT: parseInt(process.env.QUEUE_POLL_TIMEOUT || '5')
    };
  }

  /**
   * This service requires database access for data persistence
   */
  protected requiresDatabase(): boolean {
    return true;
  }

  /**
   * Service-specific startup logic
   * PM2 will call this when starting the service
   */
  protected async onStart(): Promise<void> {
    logger.info('Initializing Server Processor Service components...');

    // Initialize queue, cache, and pub/sub
    this.rawDataQueue = new ValkeyQueue(QUEUES.SERVER_INFO_RAW);
    this.cache = new ValkeyCache();
    this.updatesPubSub = new ValkeyPubSub(CHANNELS.SERVER_UPDATES);

    // Setup health checking
    this.setupHealthChecks();

    // Initialize data storage
    await this.initDataStorage();

    // Start processing loop
    await this.processLoop();
  }

  /**
   * Service-specific shutdown logic
   * PM2 will call this when stopping the service
   */
  protected async onStop(): Promise<void> {
    logger.info('Shutting down Server Processor Service...');
    this.processorRunning = false;

    // Final cache update
    try {
      await this.updateComprehensiveCache();
    } catch (error) {
      logger.error('Error during final cache update:', error);
    }

    logger.info('Server Processor Service shutdown complete');
  }

  /**
   * Setup health checks for PM2 monitoring
   */
  private setupHealthChecks(): void {
    this.healthChecker = ServiceHealthChecker.getInstance();

    // Queue connectivity health check
    this.healthChecker.registerHealthCheck('rawDataQueue', async () => {
      try {
        const queueLength = await this.rawDataQueue.length();
        return typeof queueLength === 'number';
      } catch {
        return false;
      }
    });

    // Cache connectivity health check
    this.healthChecker.registerHealthCheck('cache', async () => {
      try {
        await this.cache.set('health_check_processor', 'ok', 10);
        const result = await this.cache.get('health_check_processor');
        return result === 'ok';
      } catch {
        return false;
      }
    });

    // Pub/Sub health check
    this.healthChecker.registerHealthCheck('pubsub', async () => {
      try {
        // Simple way to test pub/sub connectivity
        await this.updatesPubSub.publish({ type: 'health_check', timestamp: Date.now() });
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Initialize server data cache from database and Valkey
   */
  private async initDataStorage(): Promise<void> {
    try {
      logger.info('Initializing data storage...');

      // Load servers from database
      const servers = await serverRepository.getAllServersWithHistory(this.processorConfig.MAX_HISTORY_HOURS);

      // Initialize cache
      this.serverDataCache.clear();

      for (const server of servers) {
        const serverKey = `${server.host}:${server.port}`;

        // Mark all servers as offline initially
        server.online = false;
        if (server.currentData) {
          server.currentData.online = false;
        }

        this.serverDataCache.set(serverKey, server);
      }

      // Store in Valkey cache
      await this.cache.set(CACHE_KEYS.ALL_SERVERS, Array.from(this.serverDataCache.values()), CACHE_TTL.ALL_SERVERS);

      logger.info(`Initialized data storage with ${this.serverDataCache.size} servers (PID: ${process.pid})`);

    } catch (error) {
      logger.error('Failed to initialize data storage:', error);
      throw error;
    }
  }

  /**
   * Process raw server data and update cache/database
   */
  private async processRawServerData(rawData: RawServerData): Promise<void> {
    const { host, port, data, timestamp, online } = rawData;
    const serverKey = `${host}:${port}`;

    try {
      // Get server from database if not in cache
      let serverEntry = this.serverDataCache.get(serverKey);

      if (!serverEntry) {
        // Try to find server in database
        const servers = await getServers();
        const dbServer = servers.find(s => s.host === host && s.port === port);

        if (!dbServer) {
          logger.warn(`Server ${serverKey} not found in database, skipping processing`);
          return;
        }

        // Create new cache entry
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
        // Server is online with data
        await serverRepository.saveServerStats(serverEntry.id, data);
        await serverRepository.saveMotdIfChanged(serverEntry.id, data);
        await serverRepository.saveMapIfChanged(serverEntry.id, data);

        // Update cache entry
        serverEntry.currentData = data;
        serverEntry.lastUpdated = timestamp;
        serverEntry.lastSeen = timestamp;
        serverEntry.online = true;
        serverEntry.consecutiveFailures = 0;

        // Add to history
        serverEntry.history.push({
          timestamp,
          players: data.players!
        });

        // Trim history if too long
        if (serverEntry.history.length > this.processorConfig.MAX_HISTORY_POINTS) {
          serverEntry.history = serverEntry.history.slice(-this.processorConfig.MAX_HISTORY_POINTS);
        }

        logger.debug(`Updated server ${serverKey}: ${data.players}/${data.playerLimit} players [PID: ${process.pid}]`);

      } else {
        // Server is offline or unreachable
        serverEntry.online = false;
        serverEntry.lastUpdated = timestamp;
        serverEntry.consecutiveFailures = (serverEntry.consecutiveFailures || 0) + 1;

        // Save offline status to database
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

        logger.debug(`Server ${serverKey} marked as offline [PID: ${process.pid}]`);
      }

      // Update individual server cache
      const serverCacheKey = CACHE_KEYS.SERVER_DATA(host, port);
      await this.cache.set(serverCacheKey, serverEntry, CACHE_TTL.SERVER_DATA);

      // Publish update to WebSocket service
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
   * Periodically update the comprehensive server cache
   */
  private async updateComprehensiveCache(): Promise<void> {
    try {
      const allServers = Array.from(this.serverDataCache.values());
      await this.cache.set(CACHE_KEYS.ALL_SERVERS, allServers, CACHE_TTL.ALL_SERVERS);
      logger.debug(`Updated comprehensive cache with ${allServers.length} servers [PID: ${process.pid}]`);
    } catch (error) {
      logger.error('Error updating comprehensive cache:', error);
    }
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    logger.info(`Starting processing loop... (PID: ${process.pid})`);

    let cacheUpdateCounter = 0;
    const CACHE_UPDATE_INTERVAL = 60; // Update comprehensive cache every 60 processed items

    while (this.processorRunning) {
      try {
        // Poll for raw server data
        const rawData = await this.rawDataQueue.pop(this.processorConfig.QUEUE_POLL_TIMEOUT);

        if (rawData) {
          await this.processRawServerData(rawData);
          cacheUpdateCounter++;

          // Periodically update comprehensive cache
          if (cacheUpdateCounter >= CACHE_UPDATE_INTERVAL) {
            await this.updateComprehensiveCache();
            cacheUpdateCounter = 0;
          }
        }

      } catch (error) {
        logger.error('Error in processing loop:', error);
        // Brief pause before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Processing loop stopped');
  }
}

// Create and start the service
// PM2 will execute this when launching the process
const service = new ServerProcessorService();
service.start();
