/**
 * Nominatim Geocoding Service
 * Replaces Google Geocoding/Places API with free OpenStreetMap Nominatim
 * Optimized for African mobility - use with Redis caching
 */

import axios from 'axios';
import { cache } from '../config/redis.js';
import logger from '../utils/logger.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const CACHE_TTL = 60 * 60 * 24; // 24 hours - Nominatim allows caching
const REQUEST_DELAY_MS = 1100; // Nominatim: max 1 req/sec

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Geocode address to coordinates
 */
export async function geocodeAddress(address, biasLat, biasLng) {
  const cacheKey = `geocode:${address?.trim().toLowerCase().substring(0, 100)}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  await rateLimit();

  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '5',
      countrycodes: 'ng', // Nigeria - make configurable for other regions
    });
    if (biasLat != null && biasLng != null) {
      params.set('viewbox', `${biasLng - 0.1},${biasLat + 0.1},${biasLng + 0.1},${biasLat - 0.1}`);
      params.set('bounded', '1');
    }

    const { data } = await axios.get(`${NOMINATIM_BASE}/search`, {
      params,
      headers: { 'User-Agent': 'KekeRideHailing/1.0' },
      timeout: 8000,
    });

    const results = (data || []).map((r) => ({
      formatted_address: r.display_name,
      location: { latitude: parseFloat(r.lat), longitude: parseFloat(r.lon) },
      place_id: r.place_id?.toString(),
      types: r.type ? [r.type] : [],
    }));

    await cache.set(cacheKey, results, CACHE_TTL);
    return results;
  } catch (err) {
    logger.error('Nominatim geocode error', { address, error: err.message });
    throw err;
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(lat, lng) {
  const cacheKey = `reverse:${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  await rateLimit();

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
    });

    const { data } = await axios.get(`${NOMINATIM_BASE}/reverse`, {
      params,
      headers: { 'User-Agent': 'KekeRideHailing/1.0' },
      timeout: 8000,
    });

    const result = data
      ? {
          formatted_address: data.display_name,
          location: {
            latitude: parseFloat(data.lat),
            longitude: parseFloat(data.lon),
          },
          place_id: data.place_id?.toString(),
        }
      : null;

    if (result) await cache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (err) {
    logger.error('Nominatim reverse geocode error', { lat, lng, error: err.message });
    throw err;
  }
}

/**
 * Map Nominatim result to our prediction shape (shared for primary + fallback)
 */
function mapNominatimToPrediction(r) {
  return {
    place_id: r.place_id?.toString(),
    name: r.name || r.display_name?.split(',')[0]?.trim() || r.display_name,
    formatted_address: r.display_name,
    description: r.display_name,
    lat: parseFloat(r.lat),
    long: parseFloat(r.lon),
    structured_formatting: {
      main_text: r.name || r.display_name?.split(',')[0]?.trim() || r.display_name,
      secondary_text: r.display_name,
    },
  };
}

/**
 * Search places (autocomplete-style) - replaces Google Places Autocomplete
 * Uses viewbox when lat/lng provided for proximity bias; fallback "query, Nigeria" when 0 results.
 */
export async function searchPlaces(query, lat, lng) {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = `places:${query.trim().toLowerCase()}:${lat?.toFixed(2) || '0'}:${lng?.toFixed(2) || '0'}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  await rateLimit();

  try {
    const params = new URLSearchParams({
      q: query.trim(),
      format: 'json',
      limit: '12',
      countrycodes: 'ng',
    });
    if (lat != null && lng != null) {
      params.set('lat', lat);
      params.set('lon', lng);
      // Viewbox biases results to user's area (left, bottom, right, top in WGS84)
      const margin = 0.15;
      params.set('viewbox', `${lng - margin},${lat - margin},${lng + margin},${lat + margin}`);
    }

    const { data } = await axios.get(`${NOMINATIM_BASE}/search`, {
      params,
      headers: { 'User-Agent': 'KekeRideHailing/1.0' },
      timeout: 8000,
    });

    let results = (data || []).map(mapNominatimToPrediction);

    // Fallback: if no results and query looks like a partial place name, retry with ", Nigeria"
    if (results.length === 0 && query.trim().length >= 3 && !/,\s*Nigeria\s*$/i.test(query.trim())) {
      await rateLimit();
      const fallbackQuery = `${query.trim()}, Nigeria`;
      const fallbackParams = new URLSearchParams({
        q: fallbackQuery,
        format: 'json',
        limit: '10',
        countrycodes: 'ng',
      });
      if (lat != null && lng != null) {
        fallbackParams.set('viewbox', `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`);
      }
      const { data: fallbackData } = await axios.get(`${NOMINATIM_BASE}/search`, {
        params: fallbackParams,
        headers: { 'User-Agent': 'KekeRideHailing/1.0' },
        timeout: 8000,
      });
      results = (fallbackData || []).map(mapNominatimToPrediction);
    }

    await cache.set(cacheKey, results, 90);
    return results;
  } catch (err) {
    logger.error('Nominatim place search error', { query, error: err.message });
    return [];
  }
}

/**
 * Get place details by place_id (Nominatim internal ID)
 * Public Nominatim has /details endpoint
 */
export async function getPlaceDetails(placeId) {
  const cacheKey = `place_details:${placeId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  await rateLimit();

  try {
    const { data } = await axios.get(`${NOMINATIM_BASE}/details`, {
      params: { place_id: placeId, format: 'json' },
      headers: { 'User-Agent': 'KekeRideHailing/1.0' },
      timeout: 8000,
    });

    const result = data
      ? {
          place_id: String(data.place_id || placeId),
          name: data.name || data.localname || data.display_name?.split(',')[0],
          formatted_address: data.display_name,
          location: {
            latitude: parseFloat(data.lat),
            longitude: parseFloat(data.lon),
          },
        }
      : null;

    if (result) await cache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (err) {
    logger.warn('Nominatim place details error', { placeId, error: err.message });
    return null;
  }
}

export default { geocodeAddress, reverseGeocode, searchPlaces, getPlaceDetails };
