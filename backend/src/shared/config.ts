// Base environment configuration shared across all services
export interface BaseServiceConfig {
  NODE_ENV: string;
  LOG_LEVEL: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;

  // Valkey
  VALKEY_HOST: string;
  VALKEY_PORT: number;
  VALKEY_PASSWORD?: string;
  VALKEY_DB: number;
  VALKEY_KEY_PREFIX: string;
}

// Service-specific configurations
export interface ServerDiscoveryConfig extends BaseServiceConfig {
  SERVER_LIST_INTERVAL_MS: number;
}

export interface ServerCollectorConfig extends BaseServiceConfig {
  COLLECTION_CONCURRENCY: number;
  MINDUSTRY_TIMEOUT_MS: number;
  QUEUE_POLL_TIMEOUT: number;
}

export interface ServerProcessorConfig extends BaseServiceConfig {
  MAX_HISTORY_HOURS: number;
  MAX_HISTORY_POINTS: number;
  QUEUE_POLL_TIMEOUT: number;
}

export interface ApiServiceConfig extends BaseServiceConfig {
  PORT: number;
  CORS_ORIGIN: string;
}

export interface WebSocketServiceConfig extends BaseServiceConfig {
  PORT: number;
  WS_PATH: string;
  CORS_ORIGIN: string;
}

// Environment variable loading helper
export function loadBaseConfig(): BaseServiceConfig {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: parseInt(process.env.DB_PORT || '5432'),
    DB_NAME: process.env.DB_NAME || 'mindustry_stats',
    DB_USER: process.env.DB_USER || 'postgres',
    DB_PASSWORD: process.env.DB_PASSWORD || '',

    VALKEY_HOST: process.env.VALKEY_HOST || 'localhost',
    VALKEY_PORT: parseInt(process.env.VALKEY_PORT || '6379'),
    VALKEY_PASSWORD: process.env.VALKEY_PASSWORD,
    VALKEY_DB: parseInt(process.env.VALKEY_DB || '0'),
    VALKEY_KEY_PREFIX: process.env.VALKEY_KEY_PREFIX || 'mindustry:'
  };
}
