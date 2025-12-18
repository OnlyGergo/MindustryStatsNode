import { createLogger } from '../logger.js';
import { InMemoryCache } from '../utils/in-memory-queue.js';
import { CACHE_KEYS, CACHE_TTL } from '../shared/constants.js';
import * as serverRepository from '../repositories/serverRepository.js';
import { ApiServiceConfig } from '../shared/config.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from "path";

const logger = createLogger('ApiService');

/**
 * API Service
 * Exposes REST API endpoints with caching
 */
export class ApiService {
  private cache: InMemoryCache;
  private config: ApiServiceConfig;
  private app!: express.Application;
  private httpServer!: http.Server;

  constructor(cache: InMemoryCache, config: ApiServiceConfig) {
    this.cache = cache;
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting API Service...');

    this.app = express();

    this.app.use(cors({
      origin: this.config.CORS_ORIGIN,
      credentials: true
    }));
    this.app.use(express.json());

    this.setupRoutes();

    // Create HTTP server but don't start it yet - will be started by main app
    this.httpServer = http.createServer(this.app);
    
    logger.info('API Service initialized (HTTP server will be started by main app)');
  }

  /**
   * Start listening on the configured port
   */
  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(this.config.PORT, () => {
        logger.info(`API Service HTTP server started on port ${this.config.PORT}`);
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  /**
   * Get the HTTP server instance for WebSocket attachment
   */
  getHttpServer(): http.Server {
    return this.httpServer;
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => resolve());
      });
    }
    logger.info('API Service stopped');
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      res.json({
        status: 'healthy',
        service: 'mindustry-stats',
        timestamp: new Date().toISOString(),
        pid: process.pid
      });
    });

    // API Routes
    this.app.get('/api/servers/:id/details', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const server = await this.getServerDetails(idNumber);

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        logger.debug(`Served server details for ID ${idNumber}`);
        res.json(server);

      } catch (error) {
        logger.error('Error fetching server details:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/api/servers/:id/motd-history', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMotdHistory(idNumber);

        logger.debug(`Served MOTD history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch MOTD history:', error);
        res.status(500).json({ error: 'Failed to fetch MOTD history' });
      }
    });

    this.app.get('/api/servers/:id/map-history', async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMapHistory(idNumber);

        logger.debug(`Served map history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch map history:', error);
        res.status(500).json({ error: 'Failed to fetch map history' });
      }
    });

    this.app.get('/api/servers', async (req, res) => {
      try {
        const servers = await this.cache.get(CACHE_KEYS.ALL_SERVERS);

        if (!servers) {
          res.status(503).json({ error: 'Server data not available' });
          return;
        }

        logger.debug(`Served ${servers.length} servers from cache`);
        res.json(servers);

      } catch (error) {
        logger.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Expose web files
    this.app.use(express.static(path.join(process.cwd(), 'public')));
  }

  /**
   * Get server details with caching
   */
  private async getServerDetails(id: number) {
    const cacheKey = CACHE_KEYS.SERVER_DETAILS(id);

    let server = await this.cache.get(cacheKey);

    if (!server) {
      server = await serverRepository.getServer(id);

      if (server) {
        await this.cache.set(cacheKey, server, CACHE_TTL.SERVER_DETAILS);
      }
    }

    return server;
  }

  /**
   * Get MOTD history with caching
   */
  private async getServerMotdHistory(id: number) {
    const cacheKey = CACHE_KEYS.MOTD_HISTORY(id);

    let history = await this.cache.get(cacheKey);

    if (!history) {
      history = await serverRepository.getMotdHistory(id);

      if (history) {
        await this.cache.set(cacheKey, history, CACHE_TTL.HISTORY);
      }
    }

    return history;
  }

  /**
   * Get map history with caching
   */
  private async getServerMapHistory(id: number) {
    const cacheKey = CACHE_KEYS.MAP_HISTORY(id);

    let history = await this.cache.get(cacheKey);

    if (!history) {
      history = await serverRepository.getMapHistory(id);

      if (history) {
        await this.cache.set(cacheKey, history, CACHE_TTL.HISTORY);
      }
    }

    return history;
  }
}
