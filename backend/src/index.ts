#!/usr/bin/env node

import {createLogger} from './logger.js';
import {initDatabase} from './config/database.js';
import {startWebServer, stopWebServer} from './api/WebServer.js';
import {apiConfig} from './api/context.js';
import {BUILD_DATE, COMMIT, VERSION} from '../../common/version.js';

const logger = createLogger('Main');

/**
 * Unified Mindustry Stats Application
 * Orchestrates all services in a single process
 */
export class MindustryStatsApp {
  // Cache cleanup interval
  private cacheCleanupInterval?: NodeJS.Timeout;

  constructor() {}

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    try {
      const timesStart = Date.now();
      logger.info('=========== Starting Mindustry Stats ===========');
      logger.info(`Version ${VERSION} | Commit ${COMMIT} | Build Date: ${BUILD_DATE}`)

      // Initialize database
      await initDatabase();

      // Serve the API + SSR frontend
      await startWebServer();

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      logger.info('=== All services started successfully ===');
      logger.info(`API & WebSocket Server: http://localhost:${apiConfig.PORT}`);
      logger.info(`Startup time: ${Date.now() - timesStart}ms ⚡`) // had to, every cli devtool has the ⚡ for speed

    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
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
        await stopWebServer();
        
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
