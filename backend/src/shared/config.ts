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
}

export interface ApiServiceConfig extends BaseServiceConfig {
  PORT: number;
  CORS_ORIGIN: string;
  GRAPH_MAX_POINTS: number;
  DATA_COLLECTION_INTERVAL_MS: number;
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
    DB_PASSWORD: process.env.DB_PASSWORD || ''
  };
}
