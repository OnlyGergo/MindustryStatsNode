import {createLogger} from '../logger.js';
import {InMemoryCache, InMemoryQueue} from '../utils/in-memory-queue.js';
import {CACHE_KEYS, CACHE_TTL} from '../shared/constants.js';
import {getServerData} from './mindustryService.js';
import * as serverRepository from '../repositories/serverRepository.js';
import {ServerRecord} from '../repositories/serverRepository.js';
import {ServerData} from '../../../common/models/serverData.js';
import {ServerCollectorConfig} from '../shared/config.js';

const logger = createLogger('ServerCollector');

export interface RawServerData {
  host: string;
  port: number;
  networkName?: string;
  data: ServerData | null;
  timestamp: number;
  online: boolean;
  error?: string;
  cacheKey: string;
  serverId: number;
}

export class ServerCollectorService {
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private config: ServerCollectorConfig;
  private serverCollectInterval?: NodeJS.Timeout;
  private collectionQueue: any;
  private running = false;

  constructor(
    rawDataQueue: InMemoryQueue<RawServerData>,
    cache: InMemoryCache,
    config: ServerCollectorConfig
  ) {
    this.rawDataQueue = rawDataQueue;
    this.cache = cache;
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting Server Collector Service...');
    this.running = true;

    const { default: PQueue } = await import('p-queue');

    this.collectionQueue = new PQueue({
      concurrency: this.config.COLLECTION_CONCURRENCY,
      interval: this.config.SERVER_COLLECTION_INTERVAL_MS,
      intervalCap: this.config.COLLECTION_CONCURRENCY * 2
    });

    this.collectServers().then(() => {
      logger.info("Initial Server Collection Complete");
    })

    // Schedule periodic server list refresh (daily)
    this.serverCollectInterval = setInterval(async () => {
      try {
        await this.collectServers();
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.config.DATA_COLLECTION_INTERVAL_MS);

    logger.info(`Server Collector Service started`);
    logger.info(`- Refresh Server Lists: every ${this.config.DATA_COLLECTION_INTERVAL_MS / 1000} seconds`);
    logger.info(`- Refresh Server Data: every ${this.config.SERVER_COLLECTION_INTERVAL_MS / 1000} seconds`);
    logger.info(`- With ${this.config.COLLECTION_CONCURRENCY} workers`);
  }

  async collectServers(): Promise<void> {
    const servers = await serverRepository.getServers();

    for (const server of servers) {
      logger.debug(`Added server ${server.id} (${server.name}) to collection queue`);
      this.collectionQueue.add(async () => {
        await this.processServerDiscovery(server);
      });
    }

    logger.info(`Added ${servers.length} servers to queue`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.serverCollectInterval) {
      clearInterval(this.serverCollectInterval);
    }
    logger.info('Server Discovery Service stopped');
  }

  private async processServerDiscovery(serverRecord: ServerRecord): Promise<void> {
    const { host, port, name, id: serverId } = serverRecord;
    const serverKey = CACHE_KEYS.SERVER_DATA(serverId);

    try {
      logger.debug(`Querying server: ${serverKey} (${name || 'Unknown Network'})`);

      const serverData = await getServerData(host, port, serverKey);

      const rawData: RawServerData = {
        host,
        port,
        networkName: name,
        data: serverData,
        timestamp: Date.now(),
        online: serverData !== null,
        cacheKey: serverKey,
        serverId: serverId
      };

      await this.cache.set(serverKey, rawData, CACHE_TTL.SERVER_DATA);

      await this.rawDataQueue.push(rawData);

      if (serverData) {
        logger.debug(`Successfully queried ${serverKey} (${name}): ${serverData.players}/${serverData.playerLimit} players`);
      } else {
        logger.debug(`Server ${serverKey} (${name}) is offline or unreachable`);
      }

    } catch (error) {
      logger.warn(`Error processing server ${serverKey} (${name || 'Unknown'}):`, error);

      const rawData: RawServerData = {
        host,
        port,
        networkName: name,
        data: null,
        timestamp: Date.now(),
        online: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKey: serverKey,
        serverId: serverId,
      };

      await this.rawDataQueue.push(rawData);
    }
  }

  getQueueStats() {
    return {
      size: this.collectionQueue.size,
      pending: this.collectionQueue.pending
    };
  }
}
