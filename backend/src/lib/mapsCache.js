/**
 * KEKE — Maps Cache Layer
 * Redis-backed cache with TTLs tuned to data staleness.
 * Place details 30d, routes 24h, autocomplete 4h.
 */

import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

const TTL = {
  PLACE_DETAILS: 60 * 60 * 24 * 30,
  GEOCODE: 60 * 60 * 24 * 7,
  ROUTE: 60 * 60 * 24,
  AUTOCOMPLETE: 60 * 60 * 4,
  DISTANCE: 60 * 60 * 24,
  LOCAL_PLACES: 60 * 60,
};

/**
 * Get Redis client; return null if not available.
 */
function redis() {
  const client = getRedisClient();
  if (!client) return null;
  if (client.isOpen === false && client.isReady === false) return null;
  return client;
}

/**
 * Run fetchFn and cache result. On cache hit, return cached data.
 * @param {string} key - cache key
 * @param {number} ttlSeconds - TTL
 * @param {() => Promise<T>} fetchFn - function that fetches fresh data
 * @returns {Promise<{ data: T, fromCache: boolean }>}
 */
export async function withCache(key, ttlSeconds, fetchFn) {
  try {
    const client = redis();
    if (client) {
      const cached = await client.get(key);
      if (cached) {
        return { data: JSON.parse(cached), fromCache: true };
      }
    }
  } catch (err) {
    logger.debug('Maps cache get failed', { key: key.substring(0, 50), error: err.message });
  }

  const data = await fetchFn();

  if (data && (Array.isArray(data) ? data.length > 0 : true)) {
    try {
      const client = redis();
      if (client) {
        await client.setEx(key, ttlSeconds, JSON.stringify(data));
      }
    } catch (err) {
      logger.debug('Maps cache set failed', { key: key.substring(0, 50), error: err.message });
    }
  }

  return { data, fromCache: false };
}

export const CacheKey = {
  placeDetails: (placeId) => `gm:place:${placeId}`,

  geocode: (address) =>
    `gm:geocode:${String(address).toLowerCase().replace(/\s+/g, '+')}`,

  reverseGeocode: (lat, lng) => `gm:revgeocode:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`,

  route: (origin, dest) =>
    `gm:route:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}:${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`,

  autocomplete: (query, cityBias) =>
    `gm:ac:${cityBias}:${String(query).toLowerCase().trim()}`,

  distanceMatrix: (origins, destinations) =>
    `gm:dm:${origins.join('|')}:${destinations.join('|')}`,

  localPlaces: (city) => `local:places:${city}`,
};

export { TTL };
