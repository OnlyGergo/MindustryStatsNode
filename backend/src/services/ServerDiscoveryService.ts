import {createLogger} from '../logger.js';
import * as serverRepository from '../repositories/serverRepository.js';
import {ServerListElement} from '../models/ServerListElement.js';
import {ServerDiscoveryConfig} from '../shared/config.js';

const logger = createLogger('ServerDiscovery');

/**
 * Server Discovery Service
 * Periodically fetches server lists and saves them to database
 */
export class ServerDiscoveryService {
  private config: ServerDiscoveryConfig;
  private serverListRefreshInterval?: NodeJS.Timeout;
  private running = false;

  constructor(config: ServerDiscoveryConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting Server Discovery Service...');
    this.running = true;

    // Initial server list refresh
    await this.refreshServerList();

    // Schedule periodic server list refresh (daily)
    this.serverListRefreshInterval = setInterval(async () => {
      try {
        await this.refreshServerList();
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.config.SERVER_LIST_INTERVAL_MS);

    logger.info(`Server Discovery Service started`);
    logger.info(`- Server list refresh: every ${this.config.SERVER_LIST_INTERVAL_MS / 1000} seconds`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.serverListRefreshInterval) {
      clearInterval(this.serverListRefreshInterval);
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
      const serverlists = await serverRepository.getAllServerLists();
      const allDiscoveredServers: Array<{name: string, host: string, port: number}> = [];
      const serverSourceListData: Array<{host: string, port: number, serverlist_id: number, display_name: string}> = [];

      for (const serverlist of serverlists) {
        logger.info(`Fetching servers from: ${serverlist.url}`);

        const response = await fetch(serverlist.url);
        if (!response.ok) {
          logger.warn(`Failed to fetch from ${serverlist.url}: ${response.statusText}`);
          continue;
        }

        const servers: ServerListElement[] = await response.json();
        groupsCount += servers.length;

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

            allDiscoveredServers.push({
              name: serverGroup.name,
              host,
              port
            });

            serverSourceListData.push({
              host,
              port,
              serverlist_id: serverlist.id,
              display_name: serverGroup.name
            });
          }
        }
      }

      // Batch upsert all discovered servers to database
      await serverRepository.batchUpsertServers(allDiscoveredServers);

      // Refresh server source list tracking
      await serverRepository.refreshServerSourceList(serverSourceListData);

      const timeTaken = (Date.now() - startTime) / 1000;
      logger.info(`Found ${groupsCount} total server groups in ${timeTaken.toFixed(2)} seconds.`);

    } catch (error) {
      logger.error('Error refreshing server list:', error);
      throw error;
    }
  }
}
