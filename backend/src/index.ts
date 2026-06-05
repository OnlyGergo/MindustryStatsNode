#!/usr/bin/env node

import {createLogger} from './logger.js';
import {initDatabase} from './config/database.js';
import {InMemoryCache, InMemoryQueue} from './utils/in-memory-queue.js';
import {loadBaseConfig} from './shared/config.js';
import {ServerDiscoveryService} from './services/ServerDiscoveryService.js';
import {RawServerData, ServerCollectorService} from './services/ServerCollectorService.js';
import {ServerProcessorService} from './services/ServerProcessorService.js';
import {ApiService} from './services/ApiService.js';
import {initCountryLookup} from './utils/countryLookup.js';
import os from 'os';
import {BUILD_DATE, COMMIT, VERSION} from '../../common/version.js';

const logger = createLogger('Main');

/**
 * Calculate default collection concurrency based on CPU cores
 */
function getDefaultConcurrency(): number {
  return Math.max(4, Math.floor(os.cpus().length * 1.5));
}

/**
 * Unified Mindustry Stats Application
 * Orchestrates all services in a single process
 */
export class MindustryStatsApp {
  // Services
  public discoveryService!: ServerDiscoveryService;
  public collectorService!: ServerCollectorService;
  public processorService!: ServerProcessorService;
  public apiService!: ApiService;

  // Shared resources
  private rawDataQueue!: InMemoryQueue<RawServerData>;
  private cache!: InMemoryCache;

  // Cache cleanup interval
  private cacheCleanupInterval?: NodeJS.Timeout;

  constructor() {}

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    try {
      logger.info('=========== Starting Mindustry Stats Unified Application ===========');
      logger.info(`Version ${VERSION} | Commit ${COMMIT} | Build Date: ${BUILD_DATE}`)

      // Initialize database
      await initDatabase();

      // Initialize country lookup for IP-to-country resolution
      initCountryLookup();

      // Load configurations
      const baseConfig = loadBaseConfig();

      const discoveryConfig = {
        ...baseConfig,
        SERVER_LIST_INTERVAL_MS: parseInt(process.env.SERVER_LIST_INTERVAL_MS || '86400000')
      };

      const collectorConfig = {
        ...baseConfig,
        COLLECTION_CONCURRENCY: parseInt(process.env.COLLECTION_CONCURRENCY || getDefaultConcurrency().toString()),
        MINDUSTRY_TIMEOUT_MS: parseInt(process.env.MINDUSTRY_TIMEOUT_MS || '1000'),
        DATA_COLLECTION_INTERVAL_MS: parseInt(process.env.DATA_COLLECTION_INTERVAL_MS || '300000'),
        SERVER_COLLECTION_INTERVAL_MS: parseInt(process.env.SERVER_COLLECTION_INTERVAL_MS || '1000')
      };

      const processorConfig = {
        ...baseConfig,
        MAX_HISTORY_HOURS: parseInt(process.env.MAX_HISTORY_HOURS || '36'),
        MAX_HISTORY_POINTS: parseInt(process.env.MAX_HISTORY_POINTS || '864'),
        QUEUE_POLL_TIMEOUT_MS: parseInt(process.env.QUEUE_POLL_TIMEOUT_MS || '10000')
      };

      const apiConfig = {
        ...baseConfig,
        PORT: parseInt(process.env.PORT || '3000'),
        CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
        GRAPH_MAX_POINTS: parseInt(process.env.GRAPH_MAX_POINTS || '168')
      };

      // Initialize shared resources
      this.rawDataQueue = new InMemoryQueue('rawData');
      this.cache = new InMemoryCache();

      // Initialize services
      this.discoveryService = new ServerDiscoveryService(discoveryConfig);
      this.collectorService = new ServerCollectorService(
        this.rawDataQueue,
        this.cache,
        collectorConfig
      );
      this.processorService = new ServerProcessorService(
        this.rawDataQueue,
        this.cache,
        processorConfig
      );
      this.apiService = new ApiService(this.cache, apiConfig);

      // Initialize processor data storage
      await this.processorService.initialize();

      // Start data processing services
      await this.discoveryService.start();
      await this.collectorService.start();
      await this.processorService.start();
      
      // Initialize API service (creates HTTP server but doesn't start listening)
      await this.apiService.start();
      
      // Start the shared HTTP server
      await this.apiService.listen();

      // Start periodic cache cleanup
      this.startCacheCleanup();

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      logger.info('=== All services started successfully ===');
      logger.info(`API & WebSocket Server: http://localhost:${apiConfig.PORT}`);
      logger.info(`Collection Concurrency: ${collectorConfig.COLLECTION_CONCURRENCY}`);
      logger.info(`Server Count: ${this.processorService.getServerCount()}`);

    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      this.cache.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Clear cache cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
      }

      // Stop all services
      try {
        await this.apiService.stop();
        await this.processorService.stop();
        await this.collectorService.stop();
        await this.discoveryService.stop();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the application
export const mindustryApp = new MindustryStatsApp();
mindustryApp.start();
