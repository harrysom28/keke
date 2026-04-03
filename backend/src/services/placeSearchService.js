/**
 * Place search: Local-first (MongoDB) then Google Places API (New) v1 with maps cache.
 * Local: seeded + learned places; if >= 3 results, skip Google. Otherwise Google autocomplete 4h cache.
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { withCache, CacheKey, TTL } from '../lib/mapsCache.js';
import { searchLocalPlaces } from './localPlaceSearch.js';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACES_V1_BASE = 'https://places.googleapis.com/v1';

const DEFAULT_REGION_CODES = ['NG'];
const RADII_METERS = [20000, 40000, 50000];
const MIN_RESULTS_BEFORE_EXPAND = 3;
const TOP_RESULTS_RETURN = 8;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function googleAutocompleteV1(input, lat, lng, radiusMeters) {
  const url = `${PLACES_V1_BASE}/places:autocomplete`;
  const body = {
    input: input.trim(),
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    includedRegionCodes: DEFAULT_REGION_CODES,
  };

  const { data } = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
    },
    timeout: 10000,
  });

  const suggestions = data.suggestions || [];
  return suggestions.map((s) => s.placePrediction).filter(Boolean);
}

/**
 * Search: local-first (MongoDB), then Google autocomplete. Cached 4h for Google.
 * Returns predictions with place_id, name, formatted_address; local results include lat/long.
 */
export async function searchPlaces(query, lat, lng, _sessionToken) {
  const searchText = (query || '').trim();
  if (searchText.length < 2) return [];

  const userLat = Number(lat);
  const userLng = Number(lng);
  if (
    Number.isNaN(userLat) ||
    Number.isNaN(userLng) ||
    userLat < -90 ||
    userLat > 90 ||
    userLng < -180 ||
    userLng > 180
  ) {
    logger.warn('Place search: invalid lat/lng', { lat, lng });
    return [];
  }

  const userLocation = { lat: userLat, lng: userLng };

  // Local-first: if we have 3+ local results, return them (no Google call)
  try {
    const localResults = await searchLocalPlaces(searchText, userLocation);
    if (localResults.length >= 3) {
      return localResults.map((r) => ({
        place_id: r.placeId,
        name: r.name,
        formatted_address: r.address,
        description: r.address,
        structured_formatting: { main_text: r.name, secondary_text: r.address },
        lat: r.location?.lat ?? null,
        long: r.location?.lng ?? null,
        distanceKm: r.distanceM != null ? Math.round((r.distanceM / 1000) * 10) / 10 : undefined,
        distanceAwayLabel:
          r.distanceM != null
            ? r.distanceM < 1000
              ? `${r.distanceM} m away`
              : `${(r.distanceM / 1000).toFixed(1)} km away`
            : undefined,
      }));
    }
  } catch (err) {
    logger.debug('Local place search failed', { error: err.message });
  }

  if (!GOOGLE_API_KEY) {
    logger.warn('Place search: GOOGLE_MAPS_API_KEY not set');
    return [];
  }

  const cityBias = `${userLat.toFixed(2)},${userLng.toFixed(2)}`;
  const cacheKey = CacheKey.autocomplete(searchText, cityBias);

  const { data: placePredictions } = await withCache(cacheKey, TTL.AUTOCOMPLETE, async () => {
    let list = [];
    for (const radius of RADII_METERS) {
      list = await googleAutocompleteV1(searchText, userLat, userLng, radius);
      if (list.length >= MIN_RESULTS_BEFORE_EXPAND) break;
    }
    return list;
  });

  if (!placePredictions || placePredictions.length === 0) return [];

  const seen = new Set();
  const deduped = placePredictions.filter((pred) => {
    const placeId = pred.placeId || (pred.place && String(pred.place).replace(/^places\//, ''));
    if (!placeId || seen.has(placeId)) return false;
    seen.add(placeId);
    return true;
  });

  const output = deduped.slice(0, TOP_RESULTS_RETURN).map((pred) => {
    const placeId = pred.placeId || (pred.place && String(pred.place).replace(/^places\//, ''));
    const text = pred.text?.text || '';
    const name = text || 'Place';
    const secondary = pred.structuredFormatting?.secondaryText || pred.formattedAddress || '';
    return {
      place_id: placeId,
      name,
      formatted_address: secondary || name,
      description: secondary || name,
      structured_formatting: {
        main_text: name,
        secondary_text: secondary,
      },
      lat: null,
      long: null,
      distanceKm: undefined,
      distanceAwayLabel: undefined,
    };
  });

  return output;
}

/**
 * Fetch one place details (called when user selects a result). Cached 30 days.
 */
async function fetchPlaceDetailsV1(placeId) {
  const url = `${PLACES_V1_BASE}/places/${encodeURIComponent(placeId)}`;
  const { data } = await axios.get(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
    timeout: 8000,
  });

  const loc = data.location;
  const lat = loc?.latitude ?? null;
  const lng = loc?.longitude ?? null;
  const name = data.displayName?.text ?? data.formattedAddress ?? '';
  const formattedAddress = data.formattedAddress ?? '';

  return {
    place_id: data.id || placeId,
    name,
    formatted_address: formattedAddress,
    latitude: lat,
    longitude: lng,
  };
}

/**
 * Get place details by place_id. Uses 30d cache so repeat lookups are free.
 */
export async function getPlaceDetails(placeId) {
  if (!GOOGLE_API_KEY || !placeId) return null;

  const key = CacheKey.placeDetails(placeId);
  const { data } = await withCache(key, TTL.PLACE_DETAILS, () => fetchPlaceDetailsV1(placeId));

  if (!data) return null;

  return {
    place_id: data.place_id,
    name: data.name,
    formatted_address: data.formatted_address,
    location: {
      latitude: data.latitude,
      longitude: data.longitude,
    },
    geometry:
      data.latitude != null && data.longitude != null
        ? {
            location: {
              lat: data.latitude,
              lng: data.longitude,
            },
          }
        : undefined,
  };
}
