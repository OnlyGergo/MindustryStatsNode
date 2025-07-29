#!/usr/bin/env node

import { createLogger } from '../logger';
import { BaseService, ServiceHealthChecker } from '../utils/service-base';
import { ValkeyQueue, ValkeyCache } from '../utils/valkey';
import { loadBaseConfig, ServerCollectorConfig } from '../shared/config';
import { QUEUES, CACHE_KEYS, CACHE_TTL, SERVICES } from '../shared/constants';
import { getServerData } from './mindustryService';
import os from 'os';

const logger = createLogger(SERVICES.SERVER_COLLECTOR);

/**
 * Server Collector Service using BaseService pattern
 * This demonstrates worker-based service architecture with PM2
 */
class ServerCollectorService extends BaseService {
  private collectorConfig: ServerCollectorConfig;
  private discoveryQueue!: ValkeyQueue;
  private rawDataQueue!: ValkeyQueue;
  private cache!: ValkeyCache;
  private workers: Promise<void>[] = [];
  private serviceRunning = true;
  private healthChecker!: ServiceHealthChecker;

  constructor() {
    super(SERVICES.SERVER_COLLECTOR);
    this.collectorConfig = {
      ...loadBaseConfig(),
      COLLECTION_CONCURRENCY: parseInt(process.env.COLLECTION_CONCURRENCY || Math.max(4, Math.floor(os.cpus().length * 1.5)).toString()),
      MINDUSTRY_TIMEOUT_MS: parseInt(process.env.MINDUSTRY_TIMEOUT_MS || '1000'),
      QUEUE_POLL_TIMEOUT: parseInt(process.env.QUEUE_POLL_TIMEOUT || '5')
    };
  }

  /**
   * This service doesn't require database access (it only uses queues)
   */
  protected requiresDatabase(): boolean {
    return false;
  }

  /**
   * Service-specific startup logic
   * PM2 will call this when starting the service
   */
  protected async onStart(): Promise<void> {
    logger.info('Initializing Server Collector Service components...');

    // Initialize queues and cache
    this.discoveryQueue = new ValkeyQueue(QUEUES.SERVER_DISCOVERY);
    this.rawDataQueue = new ValkeyQueue(QUEUES.SERVER_INFO_RAW);
    this.cache = new ValkeyCache();

    // Setup health checking
    this.setupHealthChecks();

    // Start worker processes
    for (let i = 0; i < this.collectorConfig.COLLECTION_CONCURRENCY; i++) {
      this.workers.push(this.worker(i + 1));
    }

    logger.info(`Server Collector Service initialized with ${this.collectorConfig.COLLECTION_CONCURRENCY} workers (PID: ${process.pid})`);

    // Wait for all workers (they run indefinitely)
    await Promise.all(this.workers);
  }

  /**
   * Service-specific shutdown logic
   * PM2 will call this when stopping the service
   */
  protected async onStop(): Promise<void> {
    logger.info('Shutting down Server Collector Service...');
    this.serviceRunning = false;

    // Wait for workers to finish current tasks
    await Promise.all(this.workers);

    logger.info('Server Collector Service shutdown complete');
  }

  /**
   * Setup health checks for PM2 monitoring
   */
  private setupHealthChecks(): void {
    this.healthChecker = ServiceHealthChecker.getInstance();

    // Queue connectivity health check
    this.healthChecker.registerHealthCheck('queues', async () => {
      try {
        const discoveryLength = await this.discoveryQueue.length();
        const rawDataLength = await this.rawDataQueue.length();
        // If we can get queue lengths, queues are healthy
        return true;
      } catch {
        return false;
      }
    });

    // Cache connectivity health check
    this.healthChecker.registerHealthCheck('cache', async () => {
      try {
        await this.cache.set('health_check_collector', 'ok', 10);
        const result = await this.cache.get('health_check_collector');
        return result === 'ok';
      } catch {
        return false;
      }
    });
  }

  /**
   * Worker function that continuously processes discovery queue
   * This runs in a loop until the service shuts down
   */
  private async worker(workerId: number): Promise<void> {
    logger.info(`Worker ${workerId} started (PID: ${process.pid})`);

    while (this.serviceRunning) {
      try {
        // Poll for new discovery requests
        const discoveryData = await this.discoveryQueue.pop(this.collectorConfig.QUEUE_POLL_TIMEOUT);

        if (discoveryData) {
          await this.processServerDiscovery(discoveryData);
        }

      } catch (error) {
        logger.error(`Worker ${workerId} error:`, error);
        // Brief pause before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Worker ${workerId} stopped`);
  }

  /**
   * Process a single server discovery request
   * This is the core business logic of the service
   */
  private async processServerDiscovery(discoveryData: { host: string; port: number; networkName?: string; timestamp: number }): Promise<void> {
    const { host, port, networkName } = discoveryData;
    const serverKey = `${host}:${port}`;

    try {
      logger.debug(`Querying server: ${serverKey} (${networkName || 'Unknown Network'}) [PID: ${process.pid}]`);

      // Query the Mindustry server
      const serverData = await getServerData(host, port);

      // Prepare the data for the raw queue
      const rawData = {
        host,
        port,
        networkName,
        data: serverData,
        timestamp: Date.now(),
        online: serverData !== null
      };

      // Cache the latest server data for quick retrieval
      const cacheKey = CACHE_KEYS.SERVER_DATA(host, port);
      await this.cache.set(cacheKey, rawData, CACHE_TTL.SERVER_DATA);

      // Send to processing queue
      await this.rawDataQueue.push(rawData);

      if (serverData) {
        logger.debug(`Successfully queried ${serverKey} (${networkName}): ${serverData.players}/${serverData.playerLimit} players [PID: ${process.pid}]`);
      } else {
        logger.debug(`Server ${serverKey} (${networkName}) is offline or unreachable [PID: ${process.pid}]`);
      }

    } catch (error) {
      logger.warn(`Error processing server ${serverKey} (${networkName || 'Unknown'}):`, error);

      // Still send offline data to processing queue
      const rawData = {
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
}

// Create and start the service
// PM2 will execute this when launching the process
const service = new ServerCollectorService();
service.start();
