import Redis from 'ioredis';
import { createLogger } from '../logger';

const logger = createLogger('Valkey');

// Valkey client instances
let client: Redis | null = null;
let subscriber: Redis | null = null;
let publisher: Redis | null = null;

export interface ValkeyConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

const defaultConfig: ValkeyConfig = {
  host: process.env.VALKEY_HOST || 'localhost',
  port: parseInt(process.env.VALKEY_PORT || '6379'),
  password: process.env.VALKEY_PASSWORD,
  db: parseInt(process.env.VALKEY_DB || '0'),
  keyPrefix: process.env.VALKEY_KEY_PREFIX || 'mindustry:'
};

/**
 * Initialize Valkey connections
 */
export async function initValkey(config: Partial<ValkeyConfig> = {}): Promise<void> {
  const finalConfig = { ...defaultConfig, ...config };

  try {
    // Main client for general operations
    client = new Redis({
      host: finalConfig.host,
      port: finalConfig.port,
      password: finalConfig.password,
      db: finalConfig.db,
      keyPrefix: finalConfig.keyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Subscriber client for pub/sub
    subscriber = new Redis({
      host: finalConfig.host,
      port: finalConfig.port,
      password: finalConfig.password,
      db: finalConfig.db,
      keyPrefix: finalConfig.keyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Publisher client for pub/sub
    publisher = new Redis({
      host: finalConfig.host,
      port: finalConfig.port,
      password: finalConfig.password,
      db: finalConfig.db,
      keyPrefix: finalConfig.keyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Connect all clients
    await Promise.all([
      client.connect(),
      subscriber.connect(),
      publisher.connect()
    ]);

    logger.info(`Connected to Valkey at ${finalConfig.host}:${finalConfig.port}`);
  } catch (error) {
    logger.error('Failed to connect to Valkey:', error);
    throw error;
  }
}

/**
 * Get the main Valkey client
 */
export function getValkeyClient(): Redis {
  if (!client) {
    throw new Error('Valkey client not initialized. Call initValkey() first.');
  }
  return client;
}

/**
 * Get the subscriber client
 */
export function getValkeySubscriber(): Redis {
  if (!subscriber) {
    throw new Error('Valkey subscriber not initialized. Call initValkey() first.');
  }
  return subscriber;
}

/**
 * Get the publisher client
 */
export function getValkeyPublisher(): Redis {
  if (!publisher) {
    throw new Error('Valkey publisher not initialized. Call initValkey() first.');
  }
  return publisher;
}

/**
 * Queue operations
 */
export class ValkeyQueue {
  constructor(private queueName: string) {}

  async push(data: any): Promise<void> {
    const client = getValkeyClient();
    await client.lpush(this.queueName, JSON.stringify(data));
  }

  async pop(timeout: number = 0): Promise<any | null> {
    const client = getValkeyClient();
    const result = await client.brpop(this.queueName, timeout);
    return result ? JSON.parse(result[1]) : null;
  }

  async length(): Promise<number> {
    const client = getValkeyClient();
    return await client.llen(this.queueName);
  }
}

/**
 * Pub/Sub operations
 */
export class ValkeyPubSub {
  constructor(private channel: string) {}

  async publish(data: any): Promise<void> {
    const publisher = getValkeyPublisher();
    await publisher.publish(this.channel, JSON.stringify(data));
  }

  async subscribe(callback: (data: any) => void): Promise<void> {
    const subscriber = getValkeySubscriber();
    await subscriber.subscribe(this.channel);

    subscriber.on('message', (channel, message) => {
      if (channel === this.channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          logger.error(`Failed to parse message from channel ${channel}:`, error);
        }
      }
    });
  }

  async unsubscribe(): Promise<void> {
    const subscriber = getValkeySubscriber();
    await subscriber.unsubscribe(this.channel);
  }
}

/**
 * Cache operations
 */
export class ValkeyCache {
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const client = getValkeyClient();
    const serialized = JSON.stringify(value);

    if (ttl) {
      await client.setex(key, ttl, serialized);
    } else {
      await client.set(key, serialized);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const client = getValkeyClient();
    const result = await client.get(key);
    return result ? JSON.parse(result) : null;
  }

  async del(key: string): Promise<void> {
    const client = getValkeyClient();
    await client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const client = getValkeyClient();
    return (await client.exists(key)) === 1;
  }

  async expire(key: string, ttl: number): Promise<void> {
    const client = getValkeyClient();
    await client.expire(key, ttl);
  }

  async keys(pattern: string): Promise<string[]> {
    const client = getValkeyClient();
    return await client.keys(pattern);
  }
}

/**
 * Close Valkey connections
 */
export async function closeValkey(): Promise<void> {
  const promises = [];

  if (client) {
    promises.push(client.quit());
  }
  if (subscriber) {
    promises.push(subscriber.quit());
  }
  if (publisher) {
    promises.push(publisher.quit());
  }

  await Promise.all(promises);
  logger.info('Valkey connections closed');
}
