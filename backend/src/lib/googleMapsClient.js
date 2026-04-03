/**
 * KEKE — Google Maps Client
 * Core HTTP client for Google Maps API calls.
 * Features: automatic retry, exponential backoff, circuit breaker,
 * optional cost logging, and budget guard (when Redis is available).
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

const COSTS_PER_1K = {
  autocomplete_session: 0.017,
  place_details_basic: 0.017,
  directions: 0.005,
  geocoding: 0.005,
  distance_matrix: 0.005,
};

/**
 * Track API cost in Redis (optional — no-op if Redis unavailable).
 * Budget alert at $150 daily.
 */
async function trackApiCost(apiType) {
  try {
    const redis = getRedisClient();
    if (!redis || (redis.isOpen === false && redis.isReady === false)) return { count: 0, totalSpend: 0 };

    const today = new Date().toISOString().split('T')[0];
    const key = `api_cost:${today}:${apiType}`;
    const count = await redis.incr(key);
    await redis.expire(key, 86400 * 7);

    const totalKey = `api_cost:${today}:total_usd`;
    const costUsd = COSTS_PER_1K[apiType] / 1000;
    if (typeof redis.incrByFloat === 'function') {
      await redis.incrByFloat(totalKey, costUsd);
    } else {
      const cur = parseFloat((await redis.get(totalKey)) ?? '0');
      await redis.setEx(totalKey, 86400 * 7, String(cur + costUsd));
    }
    await redis.expire(totalKey, 86400 * 7);

    const totalSpend = parseFloat((await redis.get(totalKey)) ?? '0');
    if (totalSpend > 150) {
      logger.error(`[COST ALERT] Daily Google Maps spend: $${totalSpend.toFixed(2)} — approaching free tier limit`);
    }
    return { count, totalSpend };
  } catch (err) {
    logger.warn('Cost tracking failed', { error: err.message });
    return { count: 0, totalSpend: 0 };
  }
}

/**
 * Circuit breaker: stop hammering Google after repeated failures.
 */
class CircuitBreaker {
  constructor() {
    this.failures = 0;
    this.lastFail = 0;
    this.threshold = 5;
    this.cooldownMs = 60_000;
  }

  isOpen() {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.lastFail > this.cooldownMs) {
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordFailure() {
    this.failures++;
    this.lastFail = Date.now();
  }

  recordSuccess() {
    this.failures = 0;
  }
}

const circuitBreaker = new CircuitBreaker();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_KEY;
const httpClient = axios.create({
  baseURL: 'https://maps.googleapis.com/maps/api',
  timeout: 5000,
  params: { key: GOOGLE_MAPS_API_KEY },
});

httpClient.interceptors.response.use(
  (res) => {
    circuitBreaker.recordSuccess();
    return res;
  },
  async (err) => {
    const config = err.config || {};
    config._retryCount = (config._retryCount ?? 0) + 1;

    if (config._retryCount <= 3 && err.response?.status >= 500) {
      circuitBreaker.recordFailure();
      const delay = Math.pow(2, config._retryCount) * 500;
      await new Promise((r) => setTimeout(r, delay));
      return httpClient(config);
    }

    circuitBreaker.recordFailure();
    throw err;
  }
);

/**
 * Execute a Google Maps API request with cost tracking and circuit breaker.
 * @param {string} endpoint - e.g. '/place/autocomplete/json'
 * @param {Record<string, string>} params - query params (key is added automatically)
 * @param {keyof COSTS_PER_1K} costType - for cost tracking
 * @returns {Promise<any>} response data
 */
export async function googleMapsRequest(endpoint, params, costType) {
  if (circuitBreaker.isOpen()) {
    throw new Error('Google Maps circuit breaker is open — too many recent failures');
  }

  await trackApiCost(costType);

  const { data } = await httpClient.get(endpoint, { params });
  return data;
}

export { COSTS_PER_1K };
