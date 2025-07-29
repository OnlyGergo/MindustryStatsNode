import { createLogger } from '../logger';
import { initDatabase } from '../config/database';
import { initValkey, closeValkey } from './valkey';
import { loadBaseConfig } from '../shared/config';

const logger = createLogger('Service-Base');

/**
 * Base service class with common initialization and shutdown logic
 */
export abstract class BaseService {
  protected serviceName: string;
  protected config: any;
  protected isRunning: boolean = false;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.config = loadBaseConfig();
  }

  /**
   * Initialize common dependencies (database, Valkey)
   */
  protected async initializeCommon(): Promise<void> {
    logger.info(`Initializing ${this.serviceName}...`);

    try {
      // Initialize database connection if needed
      if (this.requiresDatabase()) {
        await initDatabase();
      }

      // Initialize Valkey connection
      await initValkey();

      logger.info(`${this.serviceName} common initialization complete`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    try {
      await this.initializeCommon();
      await this.onStart();
      this.isRunning = true;
      this.setupGracefulShutdown();
      logger.info(`${this.serviceName} started successfully`);
    } catch (error) {
      logger.error(`Failed to start ${this.serviceName}:`, error);
      process.exit(1);
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping ${this.serviceName}...`);
    this.isRunning = false;

    try {
      await this.onStop();
      await closeValkey();
      logger.info(`${this.serviceName} stopped successfully`);
    } catch (error) {
      logger.error(`Error during ${this.serviceName} shutdown:`, error);
    }

    process.exit(0);
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.stop();
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.stop();
    });
  }

  /**
   * Abstract methods to be implemented by concrete services
   */
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract requiresDatabase(): boolean;
}

/**
 * Service health checker utility
 */
export class ServiceHealthChecker {
  private static instance: ServiceHealthChecker;
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();

  static getInstance(): ServiceHealthChecker {
    if (!ServiceHealthChecker.instance) {
      ServiceHealthChecker.instance = new ServiceHealthChecker();
    }
    return ServiceHealthChecker.instance;
  }

  registerHealthCheck(name: string, check: () => Promise<boolean>): void {
    this.healthChecks.set(name, check);
  }

  async checkHealth(): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {};
    let healthy = true;

    for (const [name, check] of this.healthChecks) {
      try {
        checks[name] = await check();
        if (!checks[name]) {
          healthy = false;
        }
      } catch (error) {
        checks[name] = false;
        healthy = false;
      }
    }

    return { healthy, checks };
  }
}

/**
 * Process metrics collector
 */
export class ProcessMetrics {
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  static getCpuUsage(): NodeJS.CpuUsage {
    return process.cpuUsage();
  }

  static getUptime(): number {
    return process.uptime();
  }

  static getProcessInfo() {
    return {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: this.getUptime(),
      memory: this.getMemoryUsage(),
      cpu: this.getCpuUsage()
    };
  }
}
