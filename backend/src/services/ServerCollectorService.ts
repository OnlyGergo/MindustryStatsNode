import { createLogger } from '../logger.js';
import { InMemoryQueue, InMemoryCache } from '../utils/in-memory-queue.js';
import { CACHE_KEYS, CACHE_TTL } from '../shared/constants.js';
import { getServerData } from './mindustryService.js';
import * as serverRepository from '../repositories/serverRepository.js';
import { ServerData } from '../../../common/models/serverData.js';
import { ServerCollectorConfig } from '../shared/config.js';

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

export class ServerCollectorService {
  private rawDataQueue: InMemoryQueue<RawServerData>;
  private cache: InMemoryCache;
  private config: ServerCollectorConfig;
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
      interval: 1000,
      intervalCap: this.config.COLLECTION_CONCURRENCY * 2
    });

    for (let i = 0; i < this.config.COLLECTION_CONCURRENCY; i++) {
      this.collectorWorker(i + 1);
    }

    logger.info(`Server Collector Service started with ${this.config.COLLECTION_CONCURRENCY} workers`);
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Server Collector Service stopped');
  }

  private async collectorWorker(workerId: number): Promise<void> {
    logger.info(`Collector Worker ${workerId} started`);

    while (this.running) {
      try {
        const servers = await serverRepository.getServers();

        for (const server of servers) {
          await this.collectionQueue.add(async () => {
            await this.processServerDiscovery({
              host: server.host,
              port: server.port,
              networkName: server.name,
              timestamp: Date.now()
            });
          });
        }

        await new Promise(resolve =>
          setTimeout(resolve, this.config.DATA_COLLECTION_INTERVAL_MS)
        );

      } catch (error) {
        logger.error(`Worker ${workerId} error:`, error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    logger.info(`Collector Worker ${workerId} stopped`);
  }

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
