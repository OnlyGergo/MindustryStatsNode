import { createLogger } from '../logger.js';
import { InMemoryQueue, InMemoryCache } from '../utils/in-memory-queue.js';
import { CACHE_KEYS, CACHE_TTL } from '../shared/constants.js';
import * as serverRepository from '../repositories/serverRepository.js';
import { ServerWithHistory } from '../../../common/models/serverData.js';
import { ServerProcessorConfig } from '../shared/config.js';
import { RawServerData } from './ServerCollectorService.js';

const logger = createLogger('ServerProcessor');

export class ServerProcessorService {
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private config: ServerProcessorConfig;
  private serverDataCache: Map<string, ServerWithHistory> = new Map();
  private processLoop?: NodeJS.Timeout;
  private running = false;

  constructor(
      rawDataQueue: InMemoryQueue<RawServerData>,
      cache: InMemoryCache,
      config: ServerProcessorConfig
  ) {
    this.rawDataQueue = rawDataQueue;
    this.cache = cache;
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing data storage...');
    const servers = await serverRepository.getAllServersWithHistory(this.config.MAX_HISTORY_HOURS);
    this.serverDataCache.clear();

    for (const server of servers) {
      server.online = false;
      if (server.currentData) server.currentData.online = false;
      this.serverDataCache.set(CACHE_KEYS.SERVER_DATA(server.id), server);
    }

    await this.cache.set(CACHE_KEYS.ALL_SERVERS, Array.from(this.serverDataCache.values()), CACHE_TTL.ALL_SERVERS);
    logger.info(`Initialized data storage with ${this.serverDataCache.size} servers`);
  }

  async start(): Promise<void> {
    logger.info('Starting Server Processor Service...');
    this.running = true;

    // Schedule periodic batch database uploads
    // todo, setInterval doesn't wait for previous run to finish...
    this.processLoop = setInterval(async () => {
      try {
        const processQueue = await this.rawDataQueue.popAll();
        if (processQueue.length > 0) {
          await this.processBatch(processQueue);
        }
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.config.QUEUE_POLL_TIMEOUT_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.processLoop) {
      clearInterval(this.processLoop);
    }
    logger.info('Server Processor Service stopped');
  }

  private async processBatch(batch: RawServerData[]): Promise<void> {
    const statsToInsert: any[] = [];
    const motdsToUpdate: any[] = [];
    const mapsToUpdate: any[] = [];
    const onlineServerIds: number[] = [];

    // Process memory states and prepare DB payloads
    for (const rawData of batch) {
      const { host, port, data, timestamp, online, cacheKey } = rawData;
      let serverEntry = this.serverDataCache.get(cacheKey);

      // Skip unknown servers (or fetch them like your original code, omitted here for brevity)
      if (!serverEntry) {
        serverEntry = await serverRepository.getServer(rawData.serverId)

        // This should never happen, can only really be caused by a bug or memory corruption
        if (!serverEntry) {
          logger.error(`Error in processing server entry, failed to acquire server data: ${rawData.serverId}`);
          continue;
        }
      }

      if (data && online) {
        // Compare new data against our memory cache to see if MOTD/Map ACTUALLY changed
        const currentData = serverEntry.currentData;

        const motdChanged = !currentData ||
            currentData.serverName !== data.serverName ||
            currentData.description !== data.description ||
            currentData.modeName !== data.modeName;

        const mapChanged = !currentData ||
            currentData.mapName !== data.mapName;

        // Queue up MOTD update only if changed
        if (motdChanged) {
          motdsToUpdate.push({
            server_id: serverEntry.id,
            server_name: data.serverName,
            description: data.description,
            mode_name: data.modeName
          });
        }

        // Queue up Map update only if changed
        if (mapChanged) {
          mapsToUpdate.push({
            server_id: serverEntry.id,
            map_name: data.mapName,
            game_mode: data.mode
          });
        }

        // Always queue stats and last seen
        statsToInsert.push({
          server_id: serverEntry.id,
          timestamp: timestamp,
          players: data.players,
          max_players: data.playerLimit,
          wave: data.wave,
          version: data.version,
          version_type: data.versionType,
          ping: data.ping,
          online: true
        });
        onlineServerIds.push(serverEntry.id);

        // Update in-memory state
        serverEntry.currentData = data;
        serverEntry.lastUpdated = timestamp;
        serverEntry.lastSeen = timestamp;
        serverEntry.online = true;
        serverEntry.consecutiveFailures = 0;
        serverEntry.history.push({ timestamp, players: data.players ?? 0 });

        if (serverEntry.history.length > this.config.MAX_HISTORY_POINTS) {
          serverEntry.history = serverEntry.history.slice(-this.config.MAX_HISTORY_POINTS);
        }
      } else {
        // Handle offline server state
        serverEntry.online = false;
        serverEntry.lastUpdated = timestamp;
        serverEntry.consecutiveFailures = (serverEntry.consecutiveFailures || 0) + 1;

        statsToInsert.push({
          server_id: serverEntry.id,
          timestamp: timestamp,
          online: false,
          host: host,
          port: port
        });
      }

      // Cache update & pubsub for each server (keeps realtime responsive)
      await this.cache.set(cacheKey, serverEntry, CACHE_TTL.SERVER_DATA);
    }

    try {
      logger.debug(`Saving batch of ${batch.length} servers (Stats: ${statsToInsert.length}, MOTDs: ${motdsToUpdate.length}, Maps: ${mapsToUpdate.length})`);

      // Run all independent queries in parallel using Promise.all
      await Promise.all([
        serverRepository.bulkSaveServerStats(statsToInsert),
        serverRepository.bulkUpdateLastSeen(onlineServerIds),
        serverRepository.bulkSaveMotds(motdsToUpdate),
        serverRepository.bulkSaveMaps(mapsToUpdate)
      ]);

      logger.debug(`Processed batch of ${batch.length} servers (Stats: ${statsToInsert.length}, MOTDs: ${motdsToUpdate.length}, Maps: ${mapsToUpdate.length})`);
    } catch (error) {
      logger.error('Database batch write failed:', error);
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