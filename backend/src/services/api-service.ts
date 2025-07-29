#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import http from 'http';
import { createLogger } from '../logger';
import { BaseService, ServiceHealthChecker } from '../utils/service-base';
import { ValkeyCache } from '../utils/valkey';
import { loadBaseConfig, ApiServiceConfig } from '../shared/config';
import { CACHE_KEYS, CACHE_TTL, SERVICES } from '../shared/constants';
import { getMapHistory, getMotdHistory, getServer } from '../repositories/serverRepository';

const logger = createLogger(SERVICES.API_SERVICE);

/**
 * API Service using BaseService pattern
 * This demonstrates how web servers work with PM2 clustering
 */
class ApiService extends BaseService {
  private apiConfig: ApiServiceConfig;
  private cache!: ValkeyCache;
  private app!: express.Application;
  private server!: http.Server;
  private healthChecker!: ServiceHealthChecker;

  constructor() {
    super(SERVICES.API_SERVICE);
    this.apiConfig = {
      ...loadBaseConfig(),
      PORT: parseInt(process.env.API_PORT || '3000'),
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
    };
  }

  /**
   * This service requires database access for API queries
   */
  protected requiresDatabase(): boolean {
    return true;
  }

  /**
   * Service-specific startup logic
   * PM2 will call this when starting each instance (cluster mode)
   */
  protected async onStart(): Promise<void> {
    logger.info('Initializing API Service components...');

    // Initialize cache
    this.cache = new ValkeyCache();

    // Setup health checking
    this.setupHealthChecks();

    // Create Express app with routes
    this.createApp();

    // Start HTTP server
    await this.startServer();

    logger.info(`API Service initialized on port ${this.apiConfig.PORT}`);
  }

  /**
   * Service-specific shutdown logic
   * PM2 will call this when stopping the service
   */
  protected async onStop(): Promise<void> {
    logger.info('Shutting down API Service...');

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup health checks for monitoring
   * PM2 can use these for health monitoring
   */
  private setupHealthChecks(): void {
    this.healthChecker = ServiceHealthChecker.getInstance();

    // Database health check
    this.healthChecker.registerHealthCheck('database', async () => {
      try {
        // Simple query to test database connectivity
        await getServer(1); // Try to get any server
        return true;
      } catch {
        return false;
      }
    });

    // Valkey health check
    this.healthChecker.registerHealthCheck('valkey', async () => {
      try {
        await this.cache.set('health_check', 'ok', 10);
        const result = await this.cache.get('health_check');
        return result === 'ok';
      } catch {
        return false;
      }
    });
  }

  /**
   * Create Express application with all routes
   */
  private createApp(): void {
    this.app = express();

    // Middleware
    this.app.use(cors({
      origin: this.apiConfig.CORS_ORIGIN,
      credentials: true
    }));
    this.app.use(express.json());

    // Health check endpoint (enhanced with detailed checks)
    this.app.get('/health', async (req, res) => {
      const health = await this.healthChecker.checkHealth();
      const status = health.healthy ? 200 : 503;

      res.status(status).json({
        status: health.healthy ? 'healthy' : 'unhealthy',
        service: SERVICES.API_SERVICE,
        timestamp: new Date().toISOString(),
        checks: health.checks,
        pid: process.pid // Useful for PM2 cluster debugging
      });
    });

    // API Routes with caching
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

        logger.debug(`Served server details for ID ${idNumber} (PID: ${process.pid})`);
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

        logger.debug(`Served MOTD history for server ID ${idNumber} (PID: ${process.pid})`);
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

        logger.debug(`Served map history for server ID ${idNumber} (PID: ${process.pid})`);
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

        logger.debug(`Served ${servers.length} servers from cache (PID: ${process.pid})`);
        res.json(servers);

      } catch (error) {
        logger.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Start the HTTP server
   */
  private async startServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.apiConfig.PORT, () => {
        logger.info(`API Service HTTP server started on port ${this.apiConfig.PORT} (PID: ${process.pid})`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Get server details with caching
   */
  private async getServerDetails(id: number) {
    const cacheKey = CACHE_KEYS.SERVER_DETAILS(id);

    // Try cache first
    let server = await this.cache.get(cacheKey);

    if (!server) {
      // Cache miss - fetch from database
      server = await getServer(id);

      if (server) {
        // Cache the result
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

    // Try cache first
    let history = await this.cache.get(cacheKey);

    if (!history) {
      // Cache miss - fetch from database
      history = await getMotdHistory(id);

      if (history) {
        // Cache the result
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

    // Try cache first
    let history = await this.cache.get(cacheKey);

    if (!history) {
      // Cache miss - fetch from database
      history = await getMapHistory(id);

      if (history) {
        // Cache the result
        await this.cache.set(cacheKey, history, CACHE_TTL.HISTORY);
      }
    }

    return history;
  }
}

// Create and start the service
// PM2 will execute this when launching each process instance
const service = new ApiService();
service.start();
