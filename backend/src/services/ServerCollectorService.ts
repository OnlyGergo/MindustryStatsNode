import { createLogger } from '../logger';
import { InMemoryQueue, InMemoryCache } from '../utils/in-memory-queue';
import { CACHE_KEYS, CACHE_TTL } from '../shared/constants';
import { getServerData } from './mindustryService';
import { ServerData } from '../../../common/models/serverData';
import { ServerCollectorConfig } from '../shared/config';
import PQueue from 'p-queue';

const logger = createLogger('ServerCollector');

export interface RawServerData {
  host: string;
  port: number;
  networkName?: string;
  data: ServerData | null;
  timestamp: number;
  online: boolean;
  error?: string;
}

/**
 * Server Collector Service
 * Uses p-queue to process discovery queue with concurrency control
 */
export class ServerCollectorService {
  private discoveryQueue: InMemoryQueue<any>;
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private config: ServerCollectorConfig;
  private collectionQueue: PQueue;
  private running = false;

  constructor(
    discoveryQueue: InMemoryQueue<any>,
    rawDataQueue: InMemoryQueue<RawServerData>,
    cache: InMemoryCache,
    config: ServerCollectorConfig
  ) {
    this.discoveryQueue = discoveryQueue;
    this.rawDataQueue = rawDataQueue;
    this.cache = cache;
    this.config = config;

    // Initialize p-queue for server collection with concurrency control
    this.collectionQueue = new PQueue({
      concurrency: this.config.COLLECTION_CONCURRENCY,
      interval: 1000,
      intervalCap: this.config.COLLECTION_CONCURRENCY * 2
    });
  }

  async start(): Promise<void> {
    logger.info('Starting Server Collector Service...');
    this.running = true;

    // Start workers that continuously process the discovery queue
    for (let i = 0; i < this.config.COLLECTION_CONCURRENCY; i++) {
      this.collectorWorker(i + 1);
    }

    logger.info(`Server Collector Service started with ${this.config.COLLECTION_CONCURRENCY} workers`);
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Server Collector Service stopped');
  }

  /**
   * Worker that processes discovery queue using p-queue
   */
  private async collectorWorker(workerId: number): Promise<void> {
    logger.info(`Collector Worker ${workerId} started`);

    while (this.running) {
      try {
        const discoveryData = await this.discoveryQueue.pop(this.config.QUEUE_POLL_TIMEOUT);

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

  getQueueStats() {
    return {
      size: this.collectionQueue.size,
      pending: this.collectionQueue.pending
    };
  }
}
