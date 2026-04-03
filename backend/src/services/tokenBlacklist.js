/**
 * Token blacklist service - invalidates JWT on logout
 * Uses Redis when available, MongoDB as fallback
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

const BLACKLIST_PREFIX = 'blacklist:';
const TOKEN_TTL_BUFFER = 60; // Extra seconds to account for clock skew

/**
 * Create a deterministic hash of the token for storage
 */
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get token expiry in seconds from now
 */
function getTokenTTL(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return 3600; // Default 1 hour if no exp
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    return Math.max(ttl + TOKEN_TTL_BUFFER, 60); // Min 60 seconds
  } catch {
    return 3600;
  }
}

/**
 * Add token to blacklist
 * @param {string} token - Raw JWT access token
 * @returns {Promise<boolean>} - True if blacklisted successfully
 */
export async function addToBlacklist(token) {
  if (!token || typeof token !== 'string') return false;

  const hash = tokenHash(token);
  const ttl = getTokenTTL(token);

  try {
    const redisClient = getRedisClient();
    if (redisClient?.isReady) {
      await redisClient.setEx(`${BLACKLIST_PREFIX}${hash}`, ttl, '1');
      logger.debug(`Token blacklisted (Redis): ${hash.substring(0, 12)}...`);
      return true;
    }
  } catch (err) {
    logger.warn(`Redis blacklist failed: ${err.message}`);
  }

  // MongoDB fallback
  try {
    const { BlacklistedToken } = await import('../models/BlacklistedToken.js');
    await BlacklistedToken.create({
      tokenHash: hash,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
    logger.debug(`Token blacklisted (MongoDB): ${hash.substring(0, 12)}...`);
    return true;
  } catch (err) {
    logger.error(`MongoDB blacklist failed: ${err.message}`);
    return false;
  }
}

/**
 * Check if token is blacklisted
 * @param {string} token - Raw JWT access token
 * @returns {Promise<boolean>} - True if token is blacklisted
 */
export async function isBlacklisted(token) {
  if (!token || typeof token !== 'string') return false;

  const hash = tokenHash(token);

  try {
    const redisClient = getRedisClient();
    if (redisClient?.isReady) {
      const val = await redisClient.get(`${BLACKLIST_PREFIX}${hash}`);
      return val === '1';
    }
  } catch (err) {
    logger.warn(`Redis blacklist check failed: ${err.message}`);
  }

  // MongoDB fallback
  try {
    const { BlacklistedToken } = await import('../models/BlacklistedToken.js');
    const found = await BlacklistedToken.findOne({
      tokenHash: hash,
      expiresAt: { $gt: new Date() },
    });
    return !!found;
  } catch (err) {
    logger.error(`MongoDB blacklist check failed: ${err.message}`);
    return false; // Fail open to avoid blocking users if DB has issues
  }
}
