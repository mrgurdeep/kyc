import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
};

export const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error('Redis error', { error: error.message });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Cache utilities
export const cacheService = {
  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  },

  /**
   * Set cached value with optional TTL
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error', { key, error });
    }
  },

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Cache delete error', { key, error });
    }
  },

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error('Cache delete pattern error', { pattern, error });
    }
  },

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  },

  /**
   * Increment a counter
   */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const value = await redis.incr(key);
      if (ttlSeconds && value === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error('Cache incr error', { key, error });
      return 0;
    }
  },

  /**
   * Get or set cached value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  },
};

// Session store for WebSocket connections
export const sessionStore = {
  async setUserConnection(userId: string, connectionId: string): Promise<void> {
    await redis.hset('ws:connections', userId, connectionId);
    await redis.hset('ws:users', connectionId, userId);
  },

  async removeConnection(connectionId: string): Promise<void> {
    const userId = await redis.hget('ws:users', connectionId);
    if (userId) {
      await redis.hdel('ws:connections', userId);
    }
    await redis.hdel('ws:users', connectionId);
  },

  async getUserConnection(userId: string): Promise<string | null> {
    return redis.hget('ws:connections', userId);
  },

  async getAllConnections(): Promise<Record<string, string>> {
    return redis.hgetall('ws:connections');
  },
};
