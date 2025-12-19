import { createLogger } from '../logger.js';
import { InMemoryCache, InMemoryPubSub } from '../utils/in-memory-queue.js';
import { CACHE_KEYS } from '../shared/constants.js';
import { WebSocketServiceConfig } from '../shared/config.js';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const logger = createLogger('WebSocketService');

/**
 * Extended WebSocket interface with connection tracking
 */
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
}

/**
 * WebSocket Service
 * Manages WebSocket connections and broadcasts real-time updates
 */
export class WebSocketService {
  private cache: InMemoryCache;
  private updatesPubSub: InMemoryPubSub;
  private config: WebSocketServiceConfig;
  private wsServer!: WebSocketServer;
  private wsClients: Set<ExtendedWebSocket> = new Set();
  private wsHealthCheckInterval?: NodeJS.Timeout;
  private unsubscribeUpdates?: () => void;

  constructor(
    cache: InMemoryCache,
    updatesPubSub: InMemoryPubSub,
    config: WebSocketServiceConfig
  ) {
    this.cache = cache;
    this.updatesPubSub = updatesPubSub;
    this.config = config;
  }

  async start(httpServer: http.Server): Promise<void> {
    logger.info('Starting WebSocket Service...');

    this.wsServer = new WebSocketServer({
      server: httpServer,
      path: this.config.WS_PATH,
      // Don't verify origin when CORS is set to '*' (allow all)
      // This is necessary when behind a reverse proxy where origin headers may vary
      verifyClient: this.config.CORS_ORIGIN === '*' ? undefined : (info: { origin: string }) => {
        const origin = info.origin;
        const allowed = origin === this.config.CORS_ORIGIN;
        if (!allowed) {
          logger.warn(`WebSocket connection rejected from origin: ${origin}`);
        }
        return allowed;
      },
      // Handle proxied connections properly
      perMessageDeflate: false,
      clientTracking: false // We track clients manually
    });

    this.wsServer.on('connection', (ws: ExtendedWebSocket, req) => {
      ws.isAlive = true;
      logger.debug(`WebSocket connection attempt from ${req.socket.remoteAddress}, path: ${req.url}`);
      this.registerWebSocketClient(ws);
    });

    this.wsServer.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    this.wsServer.on('headers', (headers, req) => {
      logger.debug(`WebSocket upgrade headers from ${req.socket.remoteAddress}`);
    });

    // Subscribe to server updates
    this.unsubscribeUpdates = this.updatesPubSub.subscribe((updateData: any) => {
      this.broadcastUpdate({
        type: 'server_update',
        data: updateData,
        timestamp: Date.now()
      });
    });

    // Start connection health check
    this.startConnectionHealthCheck();

    logger.info(`WebSocket server initialized on path ${this.config.WS_PATH}`);
  }

  async stop(): Promise<void> {
    // Clear health check interval
    if (this.wsHealthCheckInterval) {
      clearInterval(this.wsHealthCheckInterval);
    }

    // Unsubscribe from updates
    if (this.unsubscribeUpdates) {
      this.unsubscribeUpdates();
    }

    // Close all client connections
    for (const client of this.wsClients) {
      try {
        client.close(1000, 'Server shutting down');
      } catch (error) {
        // Ignore errors during shutdown
      }
    }

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
    }

    logger.info('WebSocket Service stopped');
  }

  /**
   * Register a new WebSocket client
   */
  private async registerWebSocketClient(client: ExtendedWebSocket): Promise<void> {
    try {
      this.wsClients.add(client);
      logger.info(`WebSocket connected, total clients: ${this.wsClients.size}`);

      const initialData = await this.cache.get(CACHE_KEYS.ALL_SERVERS);

      if (initialData) {
        client.send(JSON.stringify({
          type: 'init',
          data: initialData,
          timestamp: Date.now()
        }));
        logger.debug('Sent initial data to new WebSocket client');
      }

      client.on('close', () => {
        this.wsClients.delete(client);
        logger.info(`WebSocket disconnected, total clients: ${this.wsClients.size}`);
      });

      client.on('error', (error) => {
        logger.warn('WebSocket client error:', error);
        this.wsClients.delete(client);
      });

      client.on('pong', () => {
        client.isAlive = true;
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
          this.wsClients.delete(client);
        }
      } catch (error) {
        logger.warn('Error sending message to WebSocket client:', error);
        this.wsClients.delete(client);
        errorCount++;
      }
    }

    if (successCount > 0) {
      logger.debug(`Broadcasted update to ${successCount} clients`);
    }
    if (errorCount > 0) {
      logger.warn(`Failed to send to ${errorCount} clients`);
    }
  }

  /**
   * Start periodic health check for WebSocket connections
   */
  private startConnectionHealthCheck(): void {
    this.wsHealthCheckInterval = setInterval(() => {
      const deadClients: ExtendedWebSocket[] = [];

      for (const client of this.wsClients) {
        if (client.isAlive === false) {
          deadClients.push(client);
          continue;
        }

        client.isAlive = false;

        try {
          client.ping();
        } catch (error) {
          deadClients.push(client);
        }
      }

      for (const client of deadClients) {
        this.wsClients.delete(client);
        try {
          client.terminate();
        } catch (error) {
          // Ignore errors when terminating already dead connections
        }
      }

      if (deadClients.length > 0) {
        logger.info(`Removed ${deadClients.length} dead WebSocket connections`);
      }

    }, 30000); // Check every 30 seconds
  }

  getClientCount(): number {
    return this.wsClients.size;
  }
}
