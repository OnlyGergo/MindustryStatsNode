// Queue names
export const QUEUES = {
  SERVER_DISCOVERY: 'server_discovery_queue',
  SERVER_INFO_RAW: 'server_info_raw_queue'
} as const;

// Pub/Sub channels
export const CHANNELS = {
  SERVER_UPDATES: 'server_updates_pubsub'
} as const;

// Cache key patterns
export const CACHE_KEYS = {
  SERVER_DATA: (host: string, port: number) => `server:data:${host}:${port}`,
  SERVER_DETAILS: (id: number) => `server:details:${id}`,
  MOTD_HISTORY: (id: number) => `server:motd:${id}`,
  MAP_HISTORY: (id: number) => `server:map:${id}`,
  ALL_SERVERS: 'servers:all'
} as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  SERVER_DATA: 300, // 5 minutes
  SERVER_DETAILS: 600, // 10 minutes
  HISTORY: 3600, // 1 hour
  ALL_SERVERS: 300 // 5 minutes
} as const;

// Service names for PM2
export const SERVICES = {
  SERVER_DISCOVERY: 'server-discovery',
  SERVER_COLLECTOR: 'server-collector',
  SERVER_PROCESSOR: 'server-processor',
  API_SERVICE: 'api-service',
  WEBSOCKET_SERVICE: 'websocket-service'
} as const;
