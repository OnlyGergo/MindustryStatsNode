/**
 * DEPRECATED: This file is kept for backward compatibility with old microservices
 * The new unified application uses in-memory-queue.ts instead
 * 
 * This stub implementation throws errors if used, as Redis/Valkey is no longer required
 */

import {createLogger} from '../logger.js';

const logger = createLogger('Valkey');

export interface ValkeyConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

/**
 * Initialize Valkey connections - DEPRECATED
 */
export async function initValkey(config: Partial<ValkeyConfig> = {}): Promise<void> {
  throw new Error('Valkey/Redis is no longer used. Please use the unified application (src/index.ts) instead.');
}

/**
 * Get the main Valkey client - DEPRECATED
 */
export function getValkeyClient(): never {
  throw new Error('Valkey/Redis is no longer used. Please use the unified application (src/index.ts) instead.');
}

/**
 * Get the subscriber client - DEPRECATED
 */
export function getValkeySubscriber(): never {
  throw new Error('Valkey/Redis is no longer used. Please use the unified application (src/index.ts) instead.');
}

/**
 * Get the publisher client - DEPRECATED
 */
export function getValkeyPublisher(): never {
  throw new Error('Valkey/Redis is no longer used. Please use the unified application (src/index.ts) instead.');
}

/**
 * Queue operations - DEPRECATED
 */
export class ValkeyQueue {
  constructor(private queueName: string) {}

  async push(data: any): Promise<void> {
    throw new Error('ValkeyQueue is deprecated. Use InMemoryQueue from in-memory-queue.ts instead.');
  }

  async pop(timeout: number = 0): Promise<any | null> {
    throw new Error('ValkeyQueue is deprecated. Use InMemoryQueue from in-memory-queue.ts instead.');
  }

  async length(): Promise<number> {
    throw new Error('ValkeyQueue is deprecated. Use InMemoryQueue from in-memory-queue.ts instead.');
  }
}

/**
 * Pub/Sub operations - DEPRECATED
 */
export class ValkeyPubSub {
  constructor(private channel: string) {}

  async publish(data: any): Promise<void> {
    throw new Error('ValkeyPubSub is deprecated. Use InMemoryPubSub from in-memory-queue.ts instead.');
  }

  async subscribe(callback: (data: any) => void): Promise<void> {
    throw new Error('ValkeyPubSub is deprecated. Use InMemoryPubSub from in-memory-queue.ts instead.');
  }

  async unsubscribe(): Promise<void> {
    throw new Error('ValkeyPubSub is deprecated. Use InMemoryPubSub from in-memory-queue.ts instead.');
  }
}

/**
 * Cache operations - DEPRECATED
 */
export class ValkeyCache {
  async set(key: string, value: any, ttl?: number): Promise<void> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }

  async get<T = any>(key: string): Promise<T | null> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }

  async del(key: string): Promise<void> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }

  async exists(key: string): Promise<boolean> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }

  async expire(key: string, ttl: number): Promise<void> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }

  async keys(pattern: string): Promise<string[]> {
    throw new Error('ValkeyCache is deprecated. Use InMemoryCache from in-memory-queue.ts instead.');
  }
}

/**
 * Close Valkey connections - DEPRECATED
 */
export async function closeValkey(): Promise<void> {
  logger.info('Valkey connections are no longer used (deprecated)');
}
