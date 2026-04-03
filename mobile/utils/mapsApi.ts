import apiClient from './apiClient';

/**
 * Google Maps API service using backend proxy
 * All API calls go through backend to keep API key secure
 */

export interface DirectionsResult {
  routes: Array<{
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      duration_in_traffic?: { text: string; value: number };
      start_address: string;
      end_address: string;
      steps: Array<any>;
    }>;
    overview_polyline: { points: string };
    bounds: any;
  }>;
  status: string;
}

export interface GeocodeResult {
  results: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
      location_type: string;
    };
    place_id: string;
    types: string[];
  }>;
  status: string;
}

export interface DistanceMatrixResult {
  rows: Array<{
    elements: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      status: string;
    }>;
  }>;
  status: string;
}

/**
 * Get directions between two points
 * @param origin - Origin address or "lat,lng"
 * @param destination - Destination address or "lat,lng"
 * @param mode - Transportation mode: driving, walking, bicycling, transit
 * @param options - Additional options (waypoints, alternatives, avoid, units)
 */
export const getDirections = async (
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
  options?: {
    waypoints?: string;
    alternatives?: boolean;
    avoid?: 'tolls' | 'highways' | 'ferries' | 'indoor';
    units?: 'metric' | 'imperial';
  }
): Promise<DirectionsResult | null> => {
  try {
    const params: any = {
      origin,
      destination,
      mode,
      ...options,
    };

    const response = await apiClient.get('maps/directions', { params });

    // Backend returns: { status: 'success', data: { routes: [...] } }
    if (response.data.status === true || response.data.status === 'success') {
      const routes = response.data.data?.routes || response.data.routes;
      if (routes && routes.length > 0) {
        return { routes, status: 'OK' };
      }
    }

    return null;
  } catch (error: any) {
    console.error('Directions error:', error?.response?.data || error?.message);
    throw error;
  }
};

/**
 * Geocode an address to coordinates
 * @param address - Address to geocode
 */
export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
  try {
    const response = await apiClient.get('maps/geocode', {
      params: { address },
    });

    if ((response.data.status === true || response.data.status === 'success') && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error: any) {
    console.error('Geocoding error:', error?.response?.data || error?.message);
    throw error;
  }
};

// In-memory cache for reverse geocode to avoid rate limits (429)
const REVERSE_GEO_CACHE_MAX = 50;
const REVERSE_GEO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const reverseGeoCache = new Map<
  string,
  { data: GeocodeResult; at: number }
>();

function reverseGeoCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function reverseGeoCacheEvict(): void {
  if (reverseGeoCache.size <= REVERSE_GEO_CACHE_MAX) return;
  const entries = [...reverseGeoCache.entries()].sort((a, b) => a[1].at - b[1].at);
  const toDelete = entries.slice(0, reverseGeoCache.size - REVERSE_GEO_CACHE_MAX);
  toDelete.forEach(([k]) => reverseGeoCache.delete(k));
}

let lastRateLimitLog = 0;
const rateLimitCooldown = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 1 minute before retry after 429

// In-memory cache for pickup label resolution (local places → Google reverse geocode → safe fallback)
const PICKUP_LABEL_CACHE_MAX = 100;
const PICKUP_LABEL_CACHE_TTL_MS = 5 * 60 * 1000;
const pickupLabelCache = new Map<string, { label: string | null; formatted_address: string | null; at: number }>();

function pickupLabelCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function pickupLabelCacheEvict(): void {
  if (pickupLabelCache.size <= PICKUP_LABEL_CACHE_MAX) return;
  const entries = [...pickupLabelCache.entries()].sort((a, b) => a[1].at - b[1].at);
  const toDelete = entries.slice(0, pickupLabelCache.size - PICKUP_LABEL_CACHE_MAX);
  toDelete.forEach(([k]) => pickupLabelCache.delete(k));
}

export interface ResolvePickupResult {
  /** Full Google formatted address (preferred for display) */
  formatted_address: string | null;
  /** Short label (neighborhood, POI name, etc.) */
  label: string | null;
}

/**
 * Resolve a human-friendly pickup address for current coordinates.
 * Uses backend: local DB → Google reverse geocode (returns full formatted_address) → fallback.
 * Prefer formatted_address for display (full Google address); falls back to label.
 */
export const resolvePickupLabel = async (
  latitude: number,
  longitude: number
): Promise<string | null> => {
  const result = await resolvePickupLabelFull(latitude, longitude);
  const display = result?.formatted_address || result?.label;
  return typeof display === 'string' && display.trim().length > 0 ? display.trim() : null;
};

/**
 * Resolve pickup with both full address and short label.
 * Use formatted_address for display (full Google address).
 */
export const resolvePickupLabelFull = async (
  latitude: number,
  longitude: number
): Promise<ResolvePickupResult | null> => {
  const key = pickupLabelCacheKey(latitude, longitude);
  const cached = pickupLabelCache.get(key);
  if (cached && Date.now() - cached.at < PICKUP_LABEL_CACHE_TTL_MS) {
    return { formatted_address: cached.formatted_address ?? null, label: cached.label };
  }

  try {
    const response = await apiClient.get('maps/pickup-label', {
      params: { lat: latitude, lng: longitude },
      timeout: 10000,
    });
    const data = response.data?.data ?? response.data;
    const label = (data?.label || data?.data?.label) ?? null;
    const formattedAddress = (data?.formatted_address ?? data?.data?.formatted_address) ?? null;
    const displayLabel = typeof label === 'string' && label.trim().length > 0 ? label.trim() : null;
    const displayFormatted =
      typeof formattedAddress === 'string' && formattedAddress.trim().length > 0 ? formattedAddress.trim() : null;
    if (displayLabel || displayFormatted) {
      pickupLabelCache.set(key, {
        label: displayLabel,
        formatted_address: displayFormatted,
        at: Date.now(),
      });
      pickupLabelCacheEvict();
      return { formatted_address: displayFormatted, label: displayLabel };
    }
    return null;
  } catch (error: any) {
    if (__DEV__) {
      console.warn('Pickup label resolve error:', error?.response?.data || error?.message);
    }
    return null;
  }
};

/**
 * Reverse geocode coordinates to address.
 * Results are cached by rounded coordinates to reduce API calls and avoid 429.
 * On rate limit or other errors, returns null without throwing.
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<GeocodeResult | null> => {
  const key = reverseGeoCacheKey(latitude, longitude);
  const cached = reverseGeoCache.get(key);
  if (cached && Date.now() - cached.at < REVERSE_GEO_CACHE_TTL_MS) {
    return cached.data;
  }
  if ((rateLimitCooldown.get(key) ?? 0) > Date.now()) {
    return null;
  }

  try {
    const response = await apiClient.get('maps/geocode', {
      params: { latlng: `${latitude},${longitude}` },
    });

    if ((response.data.status === true || response.data.status === 'success') && response.data.data) {
      const data = response.data.data;
      reverseGeoCache.set(key, { data, at: Date.now() });
      reverseGeoCacheEvict();
      return data;
    }

    return null;
  } catch (error: any) {
    const status = error?.response?.status;
    const msg = error?.response?.data?.message || error?.message || '';
    const is429 = status === 429 || /too many|rate limit/i.test(String(msg));
    if (is429) {
      rateLimitCooldown.set(key, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      if (Date.now() - lastRateLimitLog > 10000) {
        lastRateLimitLog = Date.now();
        if (__DEV__) {
          console.warn('Reverse geocoding rate limited (429). Using "Current location" for now.');
        }
      }
    } else if (__DEV__) {
      console.warn('Reverse geocoding error:', msg);
    }
    return null;
  }
};

/**
 * Get distance and duration between origins and destinations
 * @param origins - Origin addresses or coordinates (comma-separated or array)
 * @param destinations - Destination addresses or coordinates (comma-separated or array)
 * @param mode - Transportation mode: driving, walking, bicycling, transit
 * @param options - Additional options (avoid, units, departure_time, traffic_model)
 */
/** POI for map markers (schools, churches, restaurants, etc.) */
export type MapPOIType =
  | 'hospital'
  | 'pharmacy'
  | 'hotel'
  | 'school'
  | 'restaurant'
  | 'church'
  | 'mosque'
  | 'bar'
  | 'broadcast'
  | 'bank'
  | 'gas_station'
  | 'transit'
  | 'other';

export interface MapPOI {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: MapPOIType;
}

/**
 * Fetch nearby places for the visible map area (Bolt-style POI markers).
 * @param lat - Center latitude
 * @param lng - Center longitude
 * @param radius - Radius in meters (500–5000, default 1500)
 */
export const getPlacesNearby = async (
  lat: number,
  lng: number,
  radius: number = 1500
): Promise<MapPOI[]> => {
  if (lat == null || lng == null || (lat === 0 && lng === 0) || Number.isNaN(lat) || Number.isNaN(lng)) {
    return [];
  }
  try {
    const response = await apiClient.get('maps/places/nearby', {
      params: { lat, lng, radius },
    });
    const data = response.data?.data ?? response.data;
    const pois = data?.pois ?? [];
    return Array.isArray(pois) ? pois : [];
  } catch (error: any) {
    if (__DEV__) {
      console.warn('Places nearby error:', error?.response?.data || error?.message);
    }
    return [];
  }
};

export const getDistanceMatrix = async (
  origins: string | string[],
  destinations: string | string[],
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
  options?: {
    avoid?: 'tolls' | 'highways' | 'ferries' | 'indoor';
    units?: 'metric' | 'imperial';
    departure_time?: number;
    traffic_model?: 'best_guess' | 'pessimistic' | 'optimistic';
  }
): Promise<DistanceMatrixResult | null> => {
  try {
    const originsStr = Array.isArray(origins) ? origins.join('|') : origins;
    const destinationsStr = Array.isArray(destinations) ? destinations.join('|') : destinations;

    const params: any = {
      origins: originsStr,
      destinations: destinationsStr,
      mode,
      ...options,
    };

    const response = await apiClient.get('maps/distance-matrix', { params });

    if (response.data.status === true && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error: any) {
    console.error('Distance matrix error:', error?.response?.data || error?.message);
    throw error;
  }
};

