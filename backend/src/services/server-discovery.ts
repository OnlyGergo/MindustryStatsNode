#!/usr/bin/env node

import { createLogger } from '../logger';
import { ValkeyQueue } from '../utils/valkey';
import { BaseService } from '../utils/service-base';
import { loadBaseConfig, ServerDiscoveryConfig } from '../shared/config';
import { QUEUES, SERVICES } from '../shared/constants';
import { SERVERS_SOURCE } from '../const';
import * as serverRepository from '../repositories/serverRepository';
import { ServerListElement } from '../models/ServerListElement';

const logger = createLogger(SERVICES.SERVER_DISCOVERY);

/**
 * Server Discovery Service using BaseService pattern
 * This demonstrates PM2-friendly service architecture
 */
class ServerDiscoveryService extends BaseService {
  private discoveryConfig: ServerDiscoveryConfig;
  private discoveryQueue!: ValkeyQueue;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    super(SERVICES.SERVER_DISCOVERY);
    this.discoveryConfig = {
      ...loadBaseConfig(),
      SERVER_LIST_INTERVAL_MS: parseInt(process.env.SERVER_LIST_INTERVAL_MS || '86400000') // 24 hours
    };
  }

  /**
   * This service requires database access for server list management
   */
  protected requiresDatabase(): boolean {
    return true;
  }

  /**
   * Service-specific startup logic
   * PM2 will call this when starting the service
   */
  protected async onStart(): Promise<void> {
    logger.info('Initializing Server Discovery Service components...');

    // Initialize queue
    this.discoveryQueue = new ValkeyQueue(QUEUES.SERVER_DISCOVERY);

    // Initial server list refresh
    await this.refreshServerList();

    // Schedule periodic refresh
    this.intervalId = setInterval(async () => {
      try {
        await this.refreshServerList();
      } catch (error) {
        logger.error('Error in scheduled server list refresh:', error);
      }
    }, this.discoveryConfig.SERVER_LIST_INTERVAL_MS);

    logger.info(`Server Discovery Service initialized. Refreshing every ${this.discoveryConfig.SERVER_LIST_INTERVAL_MS / 1000} seconds.`);
  }

  /**
   * Service-specific shutdown logic
   * PM2 will call this when stopping the service
   */
  protected async onStop(): Promise<void> {
    logger.info('Cleaning up Server Discovery Service...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Server Discovery Service cleanup complete');
  }

  /**
   * Refresh server list from all sources
   * This is the core business logic of the service
   */
  private async refreshServerList(): Promise<void> {
    let groupsCount = 0;
    const startTime = Date.now();
    logger.info("Refreshing servers...");

    try {
      // For each source get all servers
      for (const url of SERVERS_SOURCE) {
        logger.info(`Fetching servers from: ${url}`);

        // Get the JSON
        const response = await fetch(url);
        if (!response.ok) {
          logger.warn(`Failed to fetch from ${url}: ${response.statusText}`);
          continue;
        }

        const servers: ServerListElement[] = await response.json();
        groupsCount += servers.length;

        // Ensure servers exist in database
        await serverRepository.ensureServers(servers);

        // Get the actual server records from database to publish to queue
        for (const serverGroup of servers) {
          for (const address of serverGroup.address) {
            // Parse address string to get host and port
            let host: string;
            let port: number;

            if (address.includes(':')) {
              const [hostPart, portPart] = address.split(':');
              host = hostPart.trim();
              port = parseInt(portPart) || 6567; // Default Mindustry port if invalid
            } else {
              host = address.trim();
              port = 6567; // Default Mindustry port
            }

            // Publish each server to the discovery queue for collection
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
}

// Create and start the service
// PM2 will execute this when launching the process
const service = new ServerDiscoveryService();
service.start();
