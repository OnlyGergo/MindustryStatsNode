import {createLogger} from '../logger.js';
import {InMemoryCache} from '../utils/in-memory-queue.js';
import * as serverRepository from '../repositories/serverRepository.js';
import {ApiServiceConfig} from '../shared/config.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from "path";
import {BUILD_DATE, COMMIT, VERSION} from "../../../common/version.js";
import apicache from 'apicache';
import {ServerElement} from "../../../common/models/serverData.js";
import {mindustryApp} from "../index.js";
import {getAggregatedHistory, getGlobalPlayerHistory, getNetworkPlayerHistory} from "../repositories/StatsRepository.js";
import {getInactiveServers, getServerListStats} from "../repositories/ServerListRepository.js";
import {getMapHistory, getMotdHistory} from "../repositories/serverRepository.js";
import {getGlobalGamemodeHistory, getGamemodeList, getServerShareByGamemode} from "../repositories/GlobalStatsRepository.js";
import {removeColorsFromMindustry} from "../../../common/Mindustry.js";
import {ServerShareEntry} from "../../../common/models/GlobalStatsTypes.js";
import {ApiPacker} from "../../../common/Packer.js";
import {modeNameToIntOrNull} from "../../../common/Gamemode.js";

const logger = createLogger('ApiService');
const cache = apicache.middleware;

/**
 * API Service
 * Exposes REST API endpoints with caching
 */
export class ApiService {
  private serverDataCache: InMemoryCache;
  private config: ApiServiceConfig;
  private app!: express.Application;
  private httpServer!: http.Server;

  constructor(serverDataCache: InMemoryCache, config: ApiServiceConfig) {
    this.serverDataCache = serverDataCache;
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

    // Expose web files
    this.app.use(express.static(path.join(process.cwd(), 'public')));

    this.setupRoutes();

    // SPA catch-all: serve index.html for any non-API routes (enables deep linking)
    this.app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

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
    this.app.get('/health', cache("3 minutes"), async (req, res) => {
      res.json({
        status: 'healthy',
        service: 'mindustry-stats',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        build: {
            commit: COMMIT,
            buildDate: BUILD_DATE,
            version: VERSION
        }
      });
    });

    // API Routes
    this.app.get('/api/servers/:id/details', cache("3 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const server = await serverRepository.getServer(idNumber);

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

    this.app.get('/api/servers/:id/motd-history', cache("3 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const { page = '1', perPage = '20' } = req.query;
        const idNumber = parseInt(id, 10);
        const pageNumber = parseInt(page as string, 10) || 1;
        const perPageNumber = Math.min(parseInt(perPage as string, 10) || 20, 100);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMotdHistory(idNumber, pageNumber, perPageNumber);

        logger.debug(`Served MOTD history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch MOTD history:', error);
        res.status(500).json({ error: 'Failed to fetch MOTD history' });
      }
    });

    this.app.get('/api/servers/:id/map-history', cache("3 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const { page = '1', perPage = '20' } = req.query;
        const idNumber = parseInt(id, 10);
        const pageNumber = parseInt(page as string, 10) || 1;
        const perPageNumber = Math.min(parseInt(perPage as string, 10) || 20, 100);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerMapHistory(idNumber, pageNumber, perPageNumber);

        logger.debug(`Served map history for server ID ${idNumber}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch map history:', error);
        res.status(500).json({ error: 'Failed to fetch map history' });
      }
    });

    this.app.get('/api/servers/:id/history', cache("5 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const { range, startDate, endDate } = req.query;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid ID number' });
          return;
        }

        const history = await this.getServerHistory(
          idNumber, 
          range as string | undefined,
          startDate ? parseInt(startDate as string, 10) : undefined,
          endDate ? parseInt(endDate as string, 10) : undefined
        );

        logger.debug(`Served history for server ID ${idNumber} with range ${range || 'custom'}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch server history:', error);
        res.status(500).json({ error: 'Failed to fetch server history' });
      }
    });

    this.app.get('/api/servers', cache("1 minutes"), async (req, res) => {
      try {
        const servers: ServerElement[] = mindustryApp.processorService.getCachedServerElements();

        if (!servers) {
          res.status(503).json({ error: 'Server data not available' });
          return;
        }

        logger.debug(`Served ${servers.length} servers from cache`);
        res.json(ApiPacker.pack(servers));

      } catch (error) {
        logger.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Network player history endpoint
    this.app.get('/api/networks/:id/history', cache("5 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const { range } = req.query;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid network ID number' });
          return;
        }

        let hoursBack: number;
        switch (range) {
          case '7d':
            hoursBack = 168;
            break;
          case '14d':
            hoursBack = 336;
            break;
          case '3m':
            hoursBack = 2190;
            break;
          case '12m':
            hoursBack = 8760;
            break;
          default:
            hoursBack = 24;
        }

        const bucketMinutes = Math.round((hoursBack * 60) / this.config.GRAPH_MAX_POINTS);
        const history = await getNetworkPlayerHistory(idNumber, hoursBack, bucketMinutes);

        logger.debug(`Served network history for network ID ${idNumber} with range ${range || '1d'}`);
        res.json(ApiPacker.pack(history));

      } catch (error) {
        logger.error('Failed to fetch network history:', error);
        res.status(500).json({ error: 'Failed to fetch network history' });
      }
    });

    // Network details endpoint
    this.app.get('/api/networks/:id/details', cache("3 minutes"), async (req, res) => {
      try {
        const { id } = req.params;
        const idNumber = parseInt(id, 10);

        if (isNaN(idNumber)) {
          res.status(400).json({ error: 'Invalid network ID number' });
          return;
        }

        const details = await serverRepository.getNetworkDetails(idNumber);

        if (!details) {
          res.status(404).json({ error: 'Network not found' });
          return;
        }

        logger.debug(`Served network details for network ID ${idNumber}`);
        res.json(details);

      } catch (error) {
        logger.error('Failed to fetch network details:', error);
        res.status(500).json({ error: 'Failed to fetch network details' });
      }
    });

    // Global player history endpoint //todo is this unused? Client aggregates this data now...
    this.app.get('/api/global/history', cache("3 minutes"), async (req, res) => {
      try {
        const { range } = req.query;
        const history = await this.getGlobalHistory(range as string | undefined);

        logger.debug(`Served global history with range ${range || '1d'}`);
        res.json(history);

      } catch (error) {
        logger.error('Failed to fetch global history:', error);
        res.status(500).json({ error: 'Failed to fetch global history' });
      }
    });

    // Global gamemode history endpoint
    this.app.get('/api/global/gamemode-history', cache("15 minutes"), async (req, res) => {
      try {
        const { range, startDate, endDate } = req.query;

        let hoursBack: number;
        switch (range as string | undefined) {
          case '7d':
            hoursBack = 168;
            break;
          case '14d':
            hoursBack = 336;
            break;
          case '3m':
            hoursBack = 2190;
            break;
          case '12m':
            hoursBack = 8760;
            break;
          default:
            hoursBack = 24;
        }

        const bucketMinutes = Math.round((hoursBack * 60) / this.config.GRAPH_MAX_POINTS);
        let history = await getGlobalGamemodeHistory(
          hoursBack,
          bucketMinutes,
          startDate ? parseInt(startDate as string, 10) : undefined,
          endDate ? parseInt(endDate as string, 10) : undefined
        );

        logger.debug(`Served global gamemode history with range ${range || '1d'}`);
        res.json(ApiPacker.pack(history));

      } catch (error) {
        logger.error('Failed to fetch global gamemode history:', error);
        res.status(500).json({ error: 'Failed to fetch global gamemode history' });
      }
    });

    // Gamemode list endpoint
    this.app.get('/api/gamemodes', cache("1 hour"), async (req, res) => {
      try {
        const gamemodes = await getGamemodeList();

        logger.debug(`Served ${gamemodes.length} gamemodes`);
        res.json(ApiPacker.pack(gamemodes));

      } catch (error) {
        logger.error('Failed to fetch gamemode list:', error);
        res.status(500).json({ error: 'Failed to fetch gamemode list' });
      }
    });

    // Server share by gamemode endpoint
    this.app.get('/api/gamemodes/:modeName/servers', cache("15 minutes"), async (req, res) => {
      try {
        const { modeName } = req.params;
        const { range, startDate, endDate } = req.query;

        if (modeNameToIntOrNull(modeName) === null) return res.status(400).json({ error: 'GO away bot!' });

        let hoursBack: number;
        switch (range as string | undefined) {
          case '7d':
            hoursBack = 168;
            break;
          case '14d':
            hoursBack = 336;
            break;
          case '3m':
            hoursBack = 2190;
            break;
          case '12m':
            hoursBack = 8760;
            break;
          default:
            hoursBack = 24;
        }

        const bucketMinutes = Math.round((hoursBack * 60) / this.config.GRAPH_MAX_POINTS);
        let serverShare = await getServerShareByGamemode(
          modeName,
          hoursBack,
          bucketMinutes,
          startDate ? parseInt(startDate as string, 10) : undefined,
          endDate ? parseInt(endDate as string, 10) : undefined
        );

        serverShare = serverShare.map((item): ServerShareEntry => {
          return {
            ...item,
            groupName: removeColorsFromMindustry(item.groupName) ?? "Null",
            serverName: removeColorsFromMindustry(item.serverName) ?? "Null",
          }
        })

        logger.debug(`Served server share for gamemode ${modeName} with range ${range || '1d'}`);
        res.json(ApiPacker.pack(serverShare));

      } catch (error) {
        logger.error('Failed to fetch server share by gamemode:', error);
        res.status(500).json({ error: 'Failed to fetch server share by gamemode' });
      }
    });

    // Get inactive servers with their source list info
    this.app.get('/api/inactive-servers', cache("5 minutes"), async (req, res) => {
      try {
        const inactiveServers = await getInactiveServers();

        // Remove "old" servers which aren't in any list, just also aren't pruned from database
        res.json(ApiPacker.pack(inactiveServers.filter(server => {
          return server.serverLists.length >= 1
        })));
      } catch (error) {
        logger.error('Error fetching inactive servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get server list statistics
    this.app.get('/api/serverlist-stats', cache("5 minutes"), async (req, res) => {
      try {
        const stats = await getServerListStats();
        res.json(ApiPacker.pack(stats));
      } catch (error) {
        logger.error('Error fetching server list stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Get MOTD history with pagination (no caching for paginated requests)
   */
  private async getServerMotdHistory(id: number, page: number = 1, perPage: number = 20) {
    const result = await getMotdHistory(id, page, perPage);
    return result.data;
  }

  /**
   * Get map history with pagination (no caching for paginated requests)
   */
  private async getServerMapHistory(id: number, page: number = 1, perPage: number = 20) {
    const result = await getMapHistory(id, page, perPage);
    return result.data;
  }

  /**
   * Get aggregated server history for different date ranges
   */
  private async getServerHistory(
    id: number, 
    range?: string,
    startDate?: number,
    endDate?: number
  ) {
    // Calculate time range and aggregation bucket size
    let hoursBack: number;
    let bucketMinutes: number;

    // Validate range parameter
    const validRanges = ['1d', '7d', '14d', '3m', '12m'];
    if (range && !validRanges.includes(range) && range !== 'custom') {
      // Invalid range, use default
      range = '1d';
    }

    // For custom range, calculate from timestamps
    if (startDate && endDate) {
      const diffMs = endDate - startDate;
      const diffHours = diffMs / (1000 * 60 * 60);
      hoursBack = Math.ceil(diffHours);

      // Determine bucket size based on time span
      bucketMinutes = Math.round((diffHours * 60) / this.config.GRAPH_MAX_POINTS);
    }
    else
    {
      switch (range) {
        case '7d':
          hoursBack = 168;
          break;
        case '14d':
          hoursBack = 336;
          break;
        case '3m':
          hoursBack = 2190;
          break;
        case '12m':
          hoursBack = 8760;
          break;
        default:
          hoursBack = 24;
      }
      bucketMinutes = Math.round((hoursBack * 60) / this.config.GRAPH_MAX_POINTS);
    }

    return ApiPacker.pack(await getAggregatedHistory(
        id,
        hoursBack,
        bucketMinutes,
        startDate,
        endDate
    ));
  }

  /**
   * Get global player history across all servers
   */
  private async getGlobalHistory(range?: string) {
    // Validate range parameter
    const validRanges = ['1d', '7d', '14d', '3m', '12m'];
    if (range && !validRanges.includes(range)) {
      range = '1d';
    }

    let hoursBack: number;
    switch (range) {
      case '7d':
        hoursBack = 168;
        break;
      case '14d':
        hoursBack = 336;
        break;
      case '3m':
        hoursBack = 2190;
        break;
      case '12m':
        hoursBack = 8760;
        break;
      default:
        hoursBack = 24;
    }

    let bucketMinutes = Math.round((hoursBack * 60) / this.config.GRAPH_MAX_POINTS);

    return ApiPacker.pack(await getGlobalPlayerHistory(hoursBack, bucketMinutes));
  }
}
