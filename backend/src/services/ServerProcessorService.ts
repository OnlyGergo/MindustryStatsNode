import { createLogger } from '../logger.js';
import { InMemoryQueue, InMemoryPubSub, InMemoryCache } from '../utils/in-memory-queue.js';
import { CACHE_KEYS, CACHE_TTL } from '../shared/constants.js';
import * as serverRepository from '../repositories/serverRepository.js';
import { ServerWithHistory } from '../../../common/models/serverData.js';
import { ServerProcessorConfig } from '../shared/config.js';
import { RawServerData } from './ServerCollectorService.js';

const logger = createLogger('ServerProcessor');

/**
 * Server Processor Service
 * Processes raw server data and updates cache/database
 */
export class ServerProcessorService {
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private updatesPubSub: InMemoryPubSub;
  private config: ServerProcessorConfig;
  private serverDataCache: Map<string, ServerWithHistory> = new Map();
  private running = false;

  constructor(
    rawDataQueue: InMemoryQueue<RawServerData>,
    cache: InMemoryCache,
    updatesPubSub: InMemoryPubSub,
    config: ServerProcessorConfig
  ) {
    this.rawDataQueue = rawDataQueue;
    this.cache = cache;
    this.updatesPubSub = updatesPubSub;
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing data storage...');

    const servers = await serverRepository.getAllServersWithHistory(this.config.MAX_HISTORY_HOURS);

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
  }

  async start(): Promise<void> {
    logger.info('Starting Server Processor Service...');
    this.running = true;

    this.processorLoop().catch(error => {
      logger.error('Fatal error in processorLoop:', error);
      // Don't crash the process, but log the error
    });

    logger.info('Server Processor Service started');
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Server Processor Service stopped');
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
        const rawData = await this.rawDataQueue.pop(this.config.QUEUE_POLL_TIMEOUT);

        if (rawData) {
          await this.processRawServerData(rawData);
          cacheUpdateCounter++;

          if (cacheUpdateCounter >= CACHE_UPDATE_INTERVAL) {
            try {
              await this.updateComprehensiveCache();
              cacheUpdateCounter = 0;
            } catch (cacheError) {
              logger.error('Failed to update comprehensive cache:', cacheError);
              // Do not reset counter, so we retry on next iteration
            }
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
        await serverRepository.updateServerLastSeen(serverEntry.id);

        serverEntry.currentData = data;
        serverEntry.lastUpdated = timestamp;
        serverEntry.lastSeen = timestamp;
        serverEntry.online = true;
        serverEntry.consecutiveFailures = 0;

        serverEntry.history.push({
          timestamp,
          players: data.players ?? 0
        });

        if (serverEntry.history.length > this.config.MAX_HISTORY_POINTS) {
          serverEntry.history = serverEntry.history.slice(-this.config.MAX_HISTORY_POINTS);
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
   * Update the comprehensive server cache (public for shutdown)
   */
  async updateComprehensiveCache(): Promise<void> {
    try {
      const allServers = Array.from(this.serverDataCache.values());
      await this.cache.set(CACHE_KEYS.ALL_SERVERS, allServers, CACHE_TTL.ALL_SERVERS);
      logger.debug(`Updated comprehensive cache with ${allServers.length} servers`);
    } catch (error) {
      logger.error('Error updating comprehensive cache:', error);
    }
  }

  getServerCount(): number {
    return this.serverDataCache.size;
  }
}
