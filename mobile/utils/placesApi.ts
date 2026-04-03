import apiClient from './apiClient';
import { PLACES_AUTOCOMPLETE, PLACES_DETAILS } from '@/constants';
import { placesCache } from './cache';

/**
 * Places API service using backend proxy
 * This keeps Google Maps API key on the server side
 */

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  /** From Uber-level search: distance in km */
  distanceKm?: number;
  /** e.g. "2.4 km away" for UX */
  distanceAwayLabel?: string;
  /** When present, skip getPlaceDetails and use these */
  lat?: number;
  long?: number;
  name?: string;
  formatted_address?: string;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

/**
 * Search for places using backend proxy
 * @param input - Search query
 * @param location - Optional lat,lng for location bias
 * @param radius - Optional search radius in meters (default: 50000)
 * @param types - Optional type filter (omitted = searches everything: addresses, businesses, landmarks, etc.)
 *                Common options: 'establishment' (businesses), 'geocode' (addresses only), '(regions)' (geographic areas)
 */
const parseJsonMaybe = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// Request queue to prevent rate limiting
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private minDelay = 200; // Minimum 200ms between requests

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.process();
      }
    });
  }

  private async process() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      
      if (request) {
        await request();
        // Wait before processing next request
        await new Promise(resolve => setTimeout(resolve, this.minDelay));
      }
    }
    
    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

/**
 * Uber-level place search: backend re-ranks by distance. Use when user location is available.
 * Optional sessionToken for cost-efficient billing (one session per search → one details on select).
 */
export const searchPlacesWithLocation = async (
  input: string,
  lat: number,
  lng: number,
  sessionToken?: string
): Promise<PlacePrediction[]> => {
  try {
    const cacheKey = `places_search_${input}_${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const cached = placesCache.get<PlacePrediction[]>(cacheKey);
    if (cached) {
      if (__DEV__) console.log('💾 Using cached place search for:', input);
      return cached;
    }

    const params: Record<string, string | number> = { q: input, lat, lng };
    if (sessionToken) params.sessionToken = sessionToken;

    const response = await requestQueue.add(() =>
      apiClient.get('maps/places/search', { params })
    );
    const parsed = parseJsonMaybe(response.data);
    const data = parsed && typeof parsed.data === 'string' ? { ...parsed, data: parseJsonMaybe(parsed.data) } : parsed;
    const isSuccess = data?.status === true || data?.status === 'success' || data?.status === 'OK';

    if (isSuccess && data?.data?.predictions) {
      const predictions = data.data.predictions as PlacePrediction[];
      placesCache.set(cacheKey, predictions, 90000); // 90s
      return predictions;
    }
    return [];
  } catch (error: any) {
    if (error?.response?.status === 429) throw error;
    console.error('❌ Place search error:', error?.response?.data || error?.message);
    throw error;
  }
};

export const searchPlaces = async (
  input: string,
  location?: string,
  radius?: number,
  types?: string
): Promise<PlacePrediction[]> => {
  try {
    // Create cache key
    const cacheKey = `places_${input}_${location || 'no-loc'}_${radius || 'no-radius'}_${types || 'all'}`;
    
    // Check cache first
    const cached = placesCache.get<PlacePrediction[]>(cacheKey);
    if (cached) {
      if (__DEV__) {
        console.log('💾 Using cached results for:', input);
      }
      return cached;
    }

    const params: any = {
      input,
    };

    // Only include types if explicitly provided
    // When omitted, Google Places searches everything (addresses, businesses, landmarks, etc.)
    if (types) {
      params.types = types;
    }

    if (location) {
      params.location = location;
      params.radius = radius || 50000; // Increased default radius for better coverage
    }

    // Debug log in development
    if (__DEV__) {
      console.log('🔍 Places API Request - params:', params);
    }

    // Use queue to prevent rate limiting
    const response = await requestQueue.add(() => 
      apiClient.get('maps/places/autocomplete', { params })
    );
    const rawData = response.data;
    const parsed = parseJsonMaybe(rawData);
    const data = parsed && typeof parsed.data === 'string'
      ? { ...parsed, data: parseJsonMaybe(parsed.data) }
      : parsed;

    // Debug: Log full response structure
    if (__DEV__) {
      console.log('📦 Places API Response:', {
        status: data?.status,
        hasData: !!data?.data,
        predictionsCount: data?.data?.predictions?.length || 0,
        samplePrediction: data?.data?.predictions?.[0] || null,
      });
    }

    const status = data?.status;
    const isSuccess = status === true || status === 'success' || status === 'OK';

    if (isSuccess && data?.data) {
      const predictions = data.data.predictions || [];
      
      // Cache results for 5 minutes
      placesCache.set(cacheKey, predictions, 300000);
      
      if (__DEV__ && predictions.length > 0) {
        console.log('✅ Found', predictions.length, 'predictions');
      } else if (__DEV__ && predictions.length === 0) {
        console.warn('⚠️  No predictions returned from API (empty array)');
        console.warn('    Google status:', data?.data?.status);
      }
      
      return predictions;
    }

    if (__DEV__) {
      console.warn('⚠️  Unexpected response structure:', {
        status: data?.status,
        hasData: !!data?.data,
        fullResponse: JSON.stringify(data).substring(0, 200),
      });
    }

    return [];
  } catch (error: any) {
    // Handle 429 (rate limit) - throw so component can set cooldown
    if (error?.response?.status === 429) {
      console.warn('⚠️  Rate limit hit - throwing error for component handling');
      throw error; // Throw so component can detect and set cooldown
    }
    
    console.error('❌ Places autocomplete error:', error?.response?.data || error?.message);
    throw error;
  }
};

/**
 * Get place details by place_id using backend proxy
 * @param placeId - Google Places place_id
 * @param sessionToken - Optional; same token as autocomplete session for billing
 */
export const getPlaceDetails = async (
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails | null> => {
  try {
    // Check cache
    const cacheKey = `place_details_${placeId}`;
    const cached = placesCache.get<PlaceDetails>(cacheKey);
    if (cached) {
      if (__DEV__) {
        console.log('💾 Using cached place details for:', placeId);
      }
      return cached;
    }

    if (__DEV__) {
      console.log('🔍 Fetching place details for:', placeId);
    }

    const params: Record<string, string> = { place_id: placeId };
    if (sessionToken) params.sessionToken = sessionToken;

    const response = await requestQueue.add(() =>
      apiClient.get('maps/places/details', { params })
    );

    const rawData = response.data;
    const parsed = parseJsonMaybe(rawData);
    const data = parsed && typeof parsed.data === 'string'
      ? { ...parsed, data: parseJsonMaybe(parsed.data) }
      : parsed;

    // Debug: Log full response structure
    if (__DEV__) {
      console.log('📦 Place Details Response:', {
        status: data?.status,
        hasData: !!data?.data,
        hasPlace: !!data?.data?.place,
        hasResult: !!data?.data?.result,
        placeKeys: data?.data?.place ? Object.keys(data.data.place) : null,
      });
    }

    const status = data?.status;
    const isSuccess = status === true || status === 'success' || status === 'OK';

    if (isSuccess && data?.data) {
      // Backend returns data.data.place, not data.data.result
      const backendPlace = data.data.place || data.data.result;
      
      if (!backendPlace) {
        if (__DEV__) {
          console.warn('⚠️  Place details: no place or result in response.data.data');
        }
        return null;
      }

      // Transform backend format to frontend PlaceDetails interface
      // Backend uses location: { latitude, longitude }
      // Frontend expects geometry: { location: { lat, lng } }
      const placeDetails: PlaceDetails = {
        place_id: backendPlace.place_id,
        name: backendPlace.name,
        formatted_address: backendPlace.formatted_address,
        geometry: backendPlace.location
          ? {
              location: {
                lat: backendPlace.location.latitude,
                lng: backendPlace.location.longitude,
              },
            }
          : backendPlace.geometry || {
              location: { lat: 0, lng: 0 },
            },
      };

      if (__DEV__) {
        console.log('✅ Transformed place details:', {
          place_id: placeDetails.place_id,
          name: placeDetails.name,
          formatted_address: placeDetails.formatted_address,
          hasGeometry: !!placeDetails.geometry?.location,
        });
      }

      // Cache for 10 minutes (place details don't change often)
      placesCache.set(cacheKey, placeDetails, 600000);
      
      return placeDetails;
    }

    return null;
  } catch (error: any) {
    // Handle 429 (rate limit) specifically
    if (error?.response?.status === 429) {
      console.warn('⚠️  Rate limit hit for place details');
      return null;
    }
    
    console.error('❌ Places details error:', error?.response?.data || error?.message);
    
    // Don't throw on rate limit - just return null
    if (error?.response?.status === 429) {
      return null;
    }
    
    throw error;
  }
};

