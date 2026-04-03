/**
 * OSRM Routing Service
 * Replaces Google Directions API with Open Source Routing Machine
 * Uses OpenStreetMap data - cost-efficient for African mobility
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

const OSRM_BASE_URL = process.env.OSRM_URL || 'http://localhost:5000';
const OSRM_FALLBACK_URL = process.env.OSRM_FALLBACK_URL || 'https://router.project-osrm.org';
const ROUTE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours — roads stable day-to-day
const ROUTE_CACHE_KEY_PREFIX = 'route:';
const CACHE_PRECISION = 4; // ~11m grid — two trips within 11m share cache

function getOsrmBaseUrls() {
  return [...new Set([OSRM_BASE_URL, OSRM_FALLBACK_URL].filter(Boolean))];
}

/**
 * Build cache key for route
 * Format: originLat_originLng_destLat_destLng (rounded to ~111m)
 */
function routeCacheKey(originLat, originLng, destLat, destLng) {
  const round = (n, p) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p);
  return `${ROUTE_CACHE_KEY_PREFIX}${round(originLat, CACHE_PRECISION)}_${round(originLng, CACHE_PRECISION)}_${round(destLat, CACHE_PRECISION)}_${round(destLng, CACHE_PRECISION)}`;
}

/**
 * Fetch route from OSRM API
 */
async function fetchOsrmRoute(originLng, originLat, destLng, destLat) {
  const params = {
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
  };

  let lastError = null;

  for (const baseUrl of getOsrmBaseUrls()) {
    const url = `${baseUrl}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}`;

    try {
      const { data } = await axios.get(url, {
        params,
        timeout: 10000,
      });

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error(data.message || 'No route found');
      }

      if (baseUrl !== OSRM_BASE_URL) {
        logger.warn('OSRM fallback endpoint used for routing', { baseUrl });
      }

      return data.routes[0];
    } catch (err) {
      lastError = err;
      logger.warn('OSRM endpoint request failed', {
        baseUrl,
        error: err.message,
        status: err.response?.status,
      });
    }
  }

  throw lastError || new Error('No route found');
}

/**
 * Get route between two points with Redis caching
 * Returns: { distance, duration, geometry, polyline }
 */
export async function getRoute(originLat, originLng, destLat, destLng) {
  const cacheKey = routeCacheKey(originLat, originLng, destLat, destLng);

  try {
    const redis = getRedisClient();
    if (redis?.isOpen || redis?.isReady) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Route cache hit', { key: cacheKey });
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    }
  } catch (err) {
    logger.warn('Route cache get failed', { error: err.message });
  }

  try {
    const route = await fetchOsrmRoute(originLng, originLat, destLng, destLat);
    const distanceMeters = route.distance;
    const durationSeconds = route.duration;
    const geometry = route.geometry;

    // Convert GeoJSON coordinates to polyline format for client
    const coordinates = geometry?.coordinates || [];
    const polylineCoords = coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    const result = {
      distance: { value: distanceMeters, text: `${(distanceMeters / 1000).toFixed(1)} km` },
      duration: { value: durationSeconds, text: `${Math.round(durationSeconds / 60)} min` },
      geometry,
      polyline: polylineCoords,
      overview_polyline: encodePolyline(coordinates),
    };

    try {
      const redis = getRedisClient();
      if (redis?.isOpen) {
        await redis.setEx(cacheKey, ROUTE_CACHE_TTL_SECONDS, JSON.stringify(result));
      }
    } catch (err) {
      logger.warn('Route cache set failed', { error: err.message });
    }

    return result;
  } catch (err) {
    logger.error('OSRM routing error', { error: err.message, origin: [originLat, originLng], dest: [destLat, destLng] });
    throw err;
  }
}

/**
 * Encode coordinates to Google polyline format (for client compatibility)
 */
function encodePolyline(coordinates) {
  if (!coordinates?.length) return '';

  const points = coordinates.map(([lng, lat]) => [lat * 1e5, lng * 1e5]);
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of points) {
    encoded += encodeSigned(lat - prevLat);
    encoded += encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return encoded;
}

function encodeSigned(value) {
  let s = value << 1;
  if (value < 0) s = ~s;
  return encodeUnsigned(s);
}

function encodeUnsigned(value) {
  let encoded = '';
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);
  return encoded;
}

export default { getRoute };
