import { createLogger } from '../logger.js';
import { InMemoryQueue } from '../utils/in-memory-queue.js';
import { SERVERS_SOURCE } from '../const.js';
import * as serverRepository from '../repositories/serverRepository.js';
import { ServerListElement } from '../models/ServerListElement.js';
import { ServerDiscoveryConfig } from '../shared/config.js';

const logger = createLogger('ServerDiscovery');

/**
 * Server Discovery Service
 * Periodically fetches server lists and queues them for collection
 */
export class ServerDiscoveryService {
  private discoveryQueue: InMemoryQueue<any>;
  private config: ServerDiscoveryConfig;
  private serverListRefreshInterval?: NodeJS.Timeout;
  private collectionQueueInterval?: NodeJS.Timeout;
  private running = false;

  constructor(discoveryQueue: InMemoryQueue<any>, config: ServerDiscoveryConfig) {
    this.discoveryQueue = discoveryQueue;
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting Server Discovery Service...');
    this.running = true;

    // Initial server list refresh
    await this.refreshServerList();
    await this.queueAllServersForCollection();

    // Schedule periodic server list refresh (daily)
    this.serverListRefreshInterval = setInterval(async () => {
      try {
        await this.refreshServerList();
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.config.SERVER_LIST_INTERVAL_MS);

    // Schedule periodic server collection queuing (every 5 minutes)
    const DATA_COLLECTION_INTERVAL = parseInt(process.env.DATA_COLLECTION_INTERVAL_MS || '300000');
    this.collectionQueueInterval = setInterval(async () => {
      try {
        await this.queueAllServersForCollection();
      } catch (error) {
        logger.error('Error in scheduled server collection queuing:', error);
      }
    }, DATA_COLLECTION_INTERVAL);

    logger.info(`Server Discovery Service started`);
    logger.info(`- Server list refresh: every ${this.config.SERVER_LIST_INTERVAL_MS / 1000} seconds`);
    logger.info(`- Server collection queuing: every ${DATA_COLLECTION_INTERVAL / 1000} seconds`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.serverListRefreshInterval) {
      clearInterval(this.serverListRefreshInterval);
    }
    if (this.collectionQueueInterval) {
      clearInterval(this.collectionQueueInterval);
    }
    logger.info('Server Discovery Service stopped');
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
}
