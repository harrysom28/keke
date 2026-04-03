import redis from 'redis';
import logger from '../utils/logger.js';

let client = null;

/**
 * Create Redis client (does not connect — call ensureRedisConnected from server startup).
 */
export const createRedisClient = () => {
  if (client) {
    return client;
  }

  if (!process.env.REDIS_HOST || process.env.REDIS_HOST === '') {
    logger.info('Redis not configured, continuing without cache...');
    return null;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };

  const password = process.env.REDIS_PASSWORD;
  const usePassword =
    password &&
    typeof password === 'string' &&
    password.trim() !== '' &&
    password.toLowerCase() !== 'null';

  try {
    const clientOptions = {
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 10) return new Error('Redis max retries reached');
          return Math.min(retries * 100, 3000);
        },
      },
    };
    if (usePassword) {
      clientOptions.password = password;
    }
    client = redis.createClient(clientOptions);

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('error', (err) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    client.on('end', () => {
      logger.warn('Redis client connection ended');
    });
  } catch (error) {
    logger.error(`Redis client creation error: ${error.message}`);
    client = null;
  }

  return client;
};

/**
 * Connect Redis when REDIS_HOST is set. Call from server startup before accepting traffic.
 * @returns {Promise<boolean>}
 */
export async function ensureRedisConnected() {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  if (!process.env.REDIS_HOST || process.env.REDIS_HOST === '') {
    return false;
  }
  const c = createRedisClient();
  if (!c) {
    return false;
  }
  try {
    if (!c.isOpen) {
      await c.connect();
    }
    logger.info('Redis ready');
    return true;
  } catch (err) {
    logger.warn(`Redis connection failed: ${err.message}`);
    try {
      await c.quit().catch(() => {});
    } catch (_) {}
    client = null;
    return false;
  }
}

/**
 * Raw Redis client for GEO, rate-limit sendCommand, OTP keys, etc.
 * May be non-open until ensureRedisConnected() resolves.
 */
export const getRedisClient = () => {
  if (!client && process.env.REDIS_HOST) {
    createRedisClient();
  }
  return client;
};

/**
 * Close Redis connection
 */
export const closeRedisConnection = async () => {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Cache helper functions
 */
export const cache = {
  get: async (key) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient || !redisClient.isOpen) {
        return null;
      }
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`);
      return null;
    }
  },

  set: async (key, value, expirationInSeconds = 3600) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient || !redisClient.isOpen) {
        return false;
      }
      await redisClient.setEx(key, expirationInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`);
      return false;
    }
  },

  del: async (key) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient || !redisClient.isOpen) {
        return false;
      }
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error: ${error.message}`);
      return false;
    }
  },

  clearPattern: async (pattern) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient || !redisClient.isOpen) {
        return false;
      }
      const keys = [];
      for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }
      if (keys.length > 0) await redisClient.del(keys);
      return true;
    } catch (error) {
      logger.error(`Cache clear pattern error: ${error.message}`);
      return false;
    }
  },
};

export default getRedisClient;
