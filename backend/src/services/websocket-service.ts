#!/usr/bin/env node

import http from 'http';
import WebSocket from 'ws';
import { createLogger } from '../logger';
import { BaseService, ServiceHealthChecker } from '../utils/service-base';
import { ValkeyCache, ValkeyPubSub } from '../utils/valkey';
import { loadBaseConfig, WebSocketServiceConfig } from '../shared/config';
import { CHANNELS, CACHE_KEYS, SERVICES } from '../shared/constants';

const logger = createLogger(SERVICES.WEBSOCKET_SERVICE);

/**
 * WebSocket Service using BaseService pattern
 * This demonstrates real-time service architecture with PM2
 */
class WebSocketService extends BaseService {
  private wsConfig: WebSocketServiceConfig;
  private cache!: ValkeyCache;
  private updatesPubSub!: ValkeyPubSub;
  private wss!: WebSocket.Server;
  private server!: http.Server;
  private wsClients: Set<WebSocket> = new Set();
  private healthChecker!: ServiceHealthChecker;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super(SERVICES.WEBSOCKET_SERVICE);
    this.wsConfig = {
      ...loadBaseConfig(),
      PORT: parseInt(process.env.WS_PORT || '3001'),
      WS_PATH: process.env.WS_PATH || '/ws',
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
    };
  }

  /**
   * This service doesn't require database access (it only uses cache and pub/sub)
   */
  protected requiresDatabase(): boolean {
    return false;
  }

  /**
   * Service-specific startup logic
   * PM2 will call this when starting the service
   */
  protected async onStart(): Promise<void> {
    logger.info('Initializing WebSocket Service components...');

    // Initialize cache and pub/sub
    this.cache = new ValkeyCache();
    this.updatesPubSub = new ValkeyPubSub(CHANNELS.SERVER_UPDATES);

    // Setup health checking
    this.setupHealthChecks();

    // Subscribe to server updates
    await this.updatesPubSub.subscribe(this.handleServerUpdate.bind(this));
    logger.info('Subscribed to server updates channel');

    // Create and start WebSocket server
    await this.startWebSocketServer();

    // Start connection health check
    this.startConnectionHealthCheck();

    logger.info(`WebSocket Service initialized on port ${this.wsConfig.PORT}${this.wsConfig.WS_PATH} (PID: ${process.pid})`);
  }

  /**
   * Service-specific shutdown logic
   * PM2 will call this when stopping the service
   */
  protected async onStop(): Promise<void> {
    logger.info('Shutting down WebSocket Service...');

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Unsubscribe from pub/sub
    await this.updatesPubSub.unsubscribe();

    // Close all WebSocket connections
    for (const client of this.wsClients) {
      try {
        client.close(1000, 'Server shutting down');
      } catch (error) {
        // Ignore errors during shutdown
      }
    }

    // Close WebSocket server
    return new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.server) {
            this.server.close(() => {
              logger.info('WebSocket Service shutdown complete');
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup health checks for PM2 monitoring
   */
  private setupHealthChecks(): void {
    this.healthChecker = ServiceHealthChecker.getInstance();

    // Cache connectivity health check
    this.healthChecker.registerHealthCheck('cache', async () => {
      try {
        await this.cache.set('health_check_websocket', 'ok', 10);
        const result = await this.cache.get('health_check_websocket');
        return result === 'ok';
      } catch {
        return false;
      }
    });

    // Client connections health check
    this.healthChecker.registerHealthCheck('clientConnections', async () => {
      try {
        // Health check passes if we can count clients (even if 0)
        return typeof this.wsClients.size === 'number';
      } catch {
        return false;
      }
    });
  }

  /**
   * Start the WebSocket server
   */
  private async startWebSocketServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer();

      this.wss = new WebSocket.Server({
        server: this.server,
        path: this.wsConfig.WS_PATH,
        verifyClient: (info: { origin: any; }) => {
          // Basic CORS handling
          if (this.wsConfig.CORS_ORIGIN === '*') {
            return true;
          }

          const origin = info.origin;
          return origin === this.wsConfig.CORS_ORIGIN;
        }
      });

      this.wss.on('connection', (ws) => {
        // Mark as alive initially
        (ws as any).isAlive = true;
        this.registerWebSocketClient(ws);
      });

      this.server.listen(this.wsConfig.PORT, () => {
        logger.info(`WebSocket server started on port ${this.wsConfig.PORT}${this.wsConfig.WS_PATH} (PID: ${process.pid})`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Register a new WebSocket client
   */
  private async registerWebSocketClient(client: WebSocket): Promise<void> {
    try {
      this.wsClients.add(client);
      logger.info(`WebSocket connected, total clients: ${this.wsClients.size} (PID: ${process.pid})`);

      // Send initial data as welcome message
      const initialData = await this.cache.get(CACHE_KEYS.ALL_SERVERS);

      if (initialData) {
        client.send(JSON.stringify({
          type: 'init',
          data: initialData,
          timestamp: Date.now()
        }));
        logger.debug('Sent initial data to new WebSocket client');
      }

      // Handle client disconnect
      client.on('close', () => {
        this.wsClients.delete(client);
        logger.info(`WebSocket disconnected, total clients: ${this.wsClients.size} (PID: ${process.pid})`);
      });

      // Handle client errors
      client.on('error', (error) => {
        logger.warn('WebSocket client error:', error);
        this.wsClients.delete(client);
      });

      // Handle ping/pong for connection health
      client.on('pong', () => {
        // Client is alive
        (client as any).isAlive = true;
      });

    } catch (error) {
      logger.error('Error registering WebSocket client:', error);
      client.close();
    }
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(data: any): void {
    if (this.wsClients.size === 0) {
      return;
    }

    const message = JSON.stringify(data);
    let successCount = 0;
    let errorCount = 0;

    for (const client of this.wsClients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
          successCount++;
        } else {
          // Remove dead connections
          this.wsClients.delete(client);
        }
      } catch (error) {
        logger.warn('Error sending message to WebSocket client:', error);
        this.wsClients.delete(client);
        errorCount++;
      }
    }

    if (successCount > 0) {
      logger.debug(`Broadcasted update to ${successCount} clients (PID: ${process.pid})`);
    }
    if (errorCount > 0) {
      logger.warn(`Failed to send to ${errorCount} clients (PID: ${process.pid})`);
    }
  }

  /**
   * Handle server updates from pub/sub
   */
  private handleServerUpdate(updateData: any): void {
    try {
      // Broadcast the update to all connected clients
      this.broadcastUpdate({
        type: 'server_update',
        data: updateData,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error handling server update:', error);
    }
  }

  /**
   * Start periodic health check for WebSocket connections
   */
  private startConnectionHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      const deadClients: WebSocket[] = [];

      for (const client of this.wsClients) {
        if ((client as any).isAlive === false) {
          deadClients.push(client);
          continue;
        }

        // Mark as potentially dead and ping
        (client as any).isAlive = false;

        try {
          client.ping();
        } catch (error) {
          deadClients.push(client);
        }
      }

      // Remove dead clients
      for (const client of deadClients) {
        this.wsClients.delete(client);
        try {
          client.terminate();
        } catch (error) {
          // Ignore errors when terminating already dead connections
        }
      }

      if (deadClients.length > 0) {
        logger.info(`Removed ${deadClients.length} dead WebSocket connections (PID: ${process.pid})`);
      }

    }, 30000); // Check every 30 seconds
  }
}

// Create and start the service
// PM2 will execute this when launching the process
const service = new WebSocketService();
service.start();
