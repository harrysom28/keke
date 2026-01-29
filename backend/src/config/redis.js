import redis from 'redis';
import logger from '../utils/logger.js';

let client = null;

/**
 * Create Redis client
 */
export const createRedisClient = () => {
  if (client) {
    return client;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  try {
    // Redis v4+ uses createClient with different API
    client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
      password: redisConfig.password,
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('error', (err) => {
      logger.error(`Redis client error: ${err.message}`);
      // Don't crash on Redis errors
    });

    client.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    // Connect to Redis (non-blocking)
    if (process.env.NODE_ENV !== 'test') {
      // Only try to connect if Redis host is explicitly configured
      if (process.env.REDIS_HOST && process.env.REDIS_HOST !== '') {
        client.connect().catch((err) => {
          logger.error(`Failed to connect to Redis: ${err.message}`);
          logger.info('Continuing without Redis cache...');
          client = null; // Don't use Redis if connection fails
        });
      } else {
        logger.info('Redis not configured, continuing without cache...');
        client = null;
      }
    }
  } catch (error) {
    logger.error(`Redis client creation error: ${error.message}`);
    logger.info('Continuing without Redis cache...');
    client = null;
  }

  return client;
};

/**
 * Get Redis client instance
 */
export const getRedisClient = () => {
  if (!client) {
    return createRedisClient();
  }
  // Return null if client failed to connect
  if (!client.isOpen && client.isReady === false) {
    return null;
  }
  return client;
};

/**
 * Close Redis connection
 */
export const closeRedisConnection = async () => {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Cache helper functions
 */
export const cache = {
  /**
   * Get value from cache
   */
  get: async (key) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        return null;
      }
      // Redis v4+ uses isOpen or isReady
      if (redisClient.isOpen === false && redisClient.isReady === false) {
        return null;
      }
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`);
      return null;
    }
  },

  /**
   * Set value in cache
   */
  set: async (key, value, expirationInSeconds = 3600) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        return false;
      }
      if (redisClient.isOpen === false && redisClient.isReady === false) {
        return false;
      }
      await redisClient.setEx(key, expirationInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`);
      return false;
    }
  },

  /**
   * Delete value from cache
   */
  del: async (key) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        return false;
      }
      if (redisClient.isOpen === false && redisClient.isReady === false) {
        return false;
      }
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error: ${error.message}`);
      return false;
    }
  },

  /**
   * Clear all cache with pattern
   */
  clearPattern: async (pattern) => {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        return false;
      }
      if (redisClient.isOpen === false && redisClient.isReady === false) {
        return false;
      }
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (error) {
      logger.error(`Cache clear pattern error: ${error.message}`);
      return false;
    }
  },
};

export default getRedisClient;
