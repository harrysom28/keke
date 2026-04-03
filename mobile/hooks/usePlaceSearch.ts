/**
 * usePlaceSearch — Map-efficient place search
 * Session token per focus (for cost tracking), 350ms debounce, min 2 chars.
 * Fetches place details only on selection so one search session = one details call.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  searchPlacesWithLocation,
  getPlaceDetails,
  type PlacePrediction,
  type PlaceDetails,
} from '@/utils/placesApi';

function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  source: 'local' | 'google';
}

export interface UsePlaceSearchOptions {
  userLat?: number;
  userLng?: number;
  onPlaceConfirmed?: (place: PlaceResult) => void;
}

export interface UsePlaceSearchReturn {
  query: string;
  results: PlacePrediction[];
  isLoading: boolean;
  selectedPlace: PlaceResult | null;
  setQuery: (text: string) => void;
  onFocus: () => void;
  onSelect: (place: PlacePrediction) => Promise<void>;
  onClear: () => void;
}

const DEFAULT_CENTER = { lat: 6.335, lng: 8.1078 };

export function usePlaceSearch(options: UsePlaceSearchOptions = {}): UsePlaceSearchReturn {
  const { userLat, userLng, onPlaceConfirmed } = options;
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  const sessionToken = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loc = {
    lat: typeof userLat === 'number' && !Number.isNaN(userLat) ? userLat : DEFAULT_CENTER.lat,
    lng: typeof userLng === 'number' && !Number.isNaN(userLng) ? userLng : DEFAULT_CENTER.lng,
  };

  const onFocus = useCallback(() => {
    if (!sessionToken.current) {
      sessionToken.current = newSessionToken();
    }
  }, []);

  const setQuery = useCallback((text: string) => {
    setQueryState(text);
    setSelectedPlace(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!text || text.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimer.current = setTimeout(async () => {
      if (!sessionToken.current) sessionToken.current = newSessionToken();

      try {
        const predictions = await searchPlacesWithLocation(text.trim(), loc.lat, loc.lng, sessionToken.current ?? undefined);
        setResults(predictions ?? []);
      } catch (err) {
        if (__DEV__) console.error('[PlaceSearch] Search failed:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 350);
  }, [loc.lat, loc.lng]);

  const onSelect = useCallback(
    async (place: PlacePrediction) => {
      setQueryState(place.structured_formatting?.main_text || place.description || place.name || '');
      setResults([]);
      setIsLoading(false);

      let resolved: PlaceResult;

      const hasCoords =
        typeof place.lat === 'number' &&
        typeof place.long === 'number' &&
        !Number.isNaN(place.lat) &&
        !Number.isNaN(place.long);

      if (hasCoords) {
        resolved = {
          placeId: place.place_id,
          name: place.name || place.formatted_address || place.description || '',
          address: place.formatted_address || place.description || '',
          location: { lat: place.lat, lng: place.long },
          source: 'google',
        };
      } else {
        setIsLoading(true);
        try {
          const details = await getPlaceDetails(place.place_id, sessionToken.current ?? undefined);
          if (!details?.geometry?.location) {
            resolved = {
              placeId: place.place_id,
              name: place.name || place.description || '',
              address: place.formatted_address || place.description || '',
              location: null,
              source: 'google',
            };
          } else {
            resolved = {
              placeId: details.place_id,
              name: details.name || '',
              address: details.formatted_address || '',
              location: {
                lat: details.geometry.location.lat,
                lng: details.geometry.location.lng,
              },
              source: 'google',
            };
          }
        } catch {
          resolved = {
            placeId: place.place_id,
            name: place.structured_formatting?.main_text || place.description || '',
            address: place.formatted_address || place.description || '',
            location: null,
            source: 'google',
          };
        } finally {
          setIsLoading(false);
        }
      }

      sessionToken.current = null;
      setSelectedPlace(resolved);
      onPlaceConfirmed?.(resolved);
    },
    [onPlaceConfirmed]
  );

  const onClear = useCallback(() => {
    setQueryState('');
    setResults([]);
    setSelectedPlace(null);
    setIsLoading(false);
    sessionToken.current = null;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return { query, results, isLoading, selectedPlace, setQuery, onFocus, onSelect, onClear };
}
