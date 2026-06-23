import {createLogger} from '../logger.js';
import {InMemoryCache, InMemoryQueue} from '../utils/in-memory-queue.js';
import {CACHE_KEYS, CACHE_TTL} from '../shared/constants.js';
import * as serverRepository from '../repositories/serverRepository.js';
import {ServerElement} from '../../../common/models/serverData.js';
import {ServerProcessorConfig} from '../shared/config.js';
import {RawServerData} from './ServerCollectorService.js';
import {CURRENT_DATA_FRESH_THRESHOLD} from "../const";

const logger = createLogger('ServerProcessor');

export class ServerProcessorService {
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private config: ServerProcessorConfig;
  public serverDataCache: Map<string, ServerElement> = new Map();
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
    const servers = await serverRepository.getAllServerElements(this.config.MAX_HISTORY_HOURS);
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

      if (serverEntry == null) {
        serverEntry = await serverRepository.getServer(rawData.serverId)

        // This should never happen, can only really be caused by a bug or memory corruption
        if (!serverEntry) {
          logger.error(`Error in processing server entry, failed to acquire server data: ${rawData.serverId}`);
          continue;
        }
      }

      if (data != null && online) {
        // Compare new data against our memory cache to see if MOTD/Map ACTUALLY changed
        const currentData = serverEntry.currentData;

        // Queue up MOTD update only if changed
        motdsToUpdate.push({
          server_id: serverEntry.id,
          server_name: data.serverName,
          description: data.description,
          mode_name: data.modeName
        });

        // Queue up Map update only if changed
        mapsToUpdate.push({
          server_id: serverEntry.id,
          map_name: data.mapName,
          game_mode: data.mode
        });

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
      } else {
        // Handle offline server state
        serverEntry.online = false;
        serverEntry.lastUpdated = timestamp;
        serverEntry.consecutiveFailures = (serverEntry.consecutiveFailures || 0) + 1;

        // Invalidate current data if not seen for a while
        if (serverEntry.lastSeen != null &&
            serverEntry.lastSeen > new Date(Date.now() - CURRENT_DATA_FRESH_THRESHOLD).getTime()) {
          serverEntry.currentData = undefined;
        }

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
      const [, motdRegistryByServer, mapRegistryByServer] = await Promise.all([
        serverRepository.bulkUpdateLastSeen(onlineServerIds),
        serverRepository.bulkSaveMotds(motdsToUpdate),
        serverRepository.bulkSaveMaps(mapsToUpdate)
      ]);

      const statsWithRegistryIds = statsToInsert.map(stat => ({
        ...stat,
        motd_registry_id: motdRegistryByServer.get(stat.server_id) ?? null,
        map_registry_id:  mapRegistryByServer.get(stat.server_id)  ?? null,
      }));

      await serverRepository.bulkSaveServerStats(statsWithRegistryIds);

      logger.debug(`Processed batch of ${batch.length} servers (Stats: ${statsToInsert.length}, MOTDs: ${motdsToUpdate.length}, Maps: ${mapsToUpdate.length})`);
    } catch (error) {
      logger.error('Database batch write failed:', (error as Error).message);
    }
  }

  /**
   * Update the comprehensive server cache (public for shutdown)
   */
  getCachedServerElements(): ServerElement[] {
    //todo should this have a TTL - this risks stale data, though they are timestamped
    return Array.from(this.serverDataCache.values());
  }

  getServerCount(): number {
    return this.serverDataCache.size;
  }
}