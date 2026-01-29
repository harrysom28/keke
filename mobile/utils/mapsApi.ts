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

    if (response.data.status === true && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error: any) {
    console.error('Geocoding error:', error?.response?.data || error?.message);
    throw error;
  }
};

/**
 * Reverse geocode coordinates to address
 * @param latitude - Latitude
 * @param longitude - Longitude
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<GeocodeResult | null> => {
  try {
    const response = await apiClient.get('maps/geocode', {
      params: { latlng: `${latitude},${longitude}` },
    });

    if (response.data.status === true && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error: any) {
    console.error('Reverse geocoding error:', error?.response?.data || error?.message);
    throw error;
  }
};

/**
 * Get distance and duration between origins and destinations
 * @param origins - Origin addresses or coordinates (comma-separated or array)
 * @param destinations - Destination addresses or coordinates (comma-separated or array)
 * @param mode - Transportation mode: driving, walking, bicycling, transit
 * @param options - Additional options (avoid, units, departure_time, traffic_model)
 */
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

