/**
 * Hook for throttled location updates with distance checking
 */

import { useRef, useCallback } from 'react';
import { requestManager } from '@/utils/requestManager';
import apiClient from '@/utils/apiClient';

interface Location {
  lat: number;
  lng: number;
  address?: string;
  accuracy?: string;
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

interface UseLocationUpdateOptions {
  throttleMs?: number; // Time between updates
  minDistance?: number; // Minimum distance to trigger update (meters)
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

/**
 * Hook for throttled location updates
 * Prevents excessive API calls by throttling and distance checking
 * 
 * @example
 * const updateLocation = useLocationUpdate({
 *   throttleMs: 15000, // Update max once per 15 seconds
 *   minDistance: 50,   // Only update if moved 50 meters
 * });
 * 
 * // Later in your code
 * updateLocation({ lat: 6.32306, lng: 8.11201, address: '...' });
 */
export function useLocationUpdate(options: UseLocationUpdateOptions = {}) {
  const {
    throttleMs = 15000, // 15 seconds default
    minDistance = 50, // 50 meters default
    onSuccess,
    onError,
  } = options;

  const lastUpdateRef = useRef(0);
  const lastLocationRef = useRef<Location | null>(null);
  const updateInProgressRef = useRef(false);

  const shouldUpdate = useCallback(
    (newLocation: Location): boolean => {
      const now = Date.now();

      // Validate coordinates
      if (!newLocation.lat || !newLocation.lng) {
        if (__DEV__) {
          console.log('⏭️ Invalid coordinates, skipping update');
        }
        return false;
      }

      // Check if another update is in progress
      if (updateInProgressRef.current) {
        if (__DEV__) {
          console.log('⏭️ Update already in progress, skipping');
        }
        return false;
      }

      // Time throttle
      if (now - lastUpdateRef.current < throttleMs) {
        if (__DEV__) {
          const remaining = Math.ceil((throttleMs - (now - lastUpdateRef.current)) / 1000);
          console.log(`⏭️ Throttled (wait ${remaining}s), skipping update`);
        }
        return false;
      }

      // Distance check
      if (lastLocationRef.current) {
        const distance = calculateDistance(
          lastLocationRef.current.lat,
          lastLocationRef.current.lng,
          newLocation.lat,
          newLocation.lng
        );

        if (distance < minDistance) {
          if (__DEV__) {
            console.log(`⏭️ Distance too small (${Math.round(distance)}m < ${minDistance}m), skipping update`);
          }
          return false;
        }
      }

      return true;
    },
    [throttleMs, minDistance]
  );

  const updateLocation = useCallback(
    async (location: Location) => {
      if (!shouldUpdate(location)) {
        return;
      }

      updateInProgressRef.current = true;
      lastUpdateRef.current = Date.now();
      lastLocationRef.current = location;

      try {
        await requestManager.execute(
          'location-update',
          () =>
            apiClient.patch('/update/locations/drivers-passengers', {
              latitude: location.lat,
              longitude: location.lng,
              address: location.address || `Location (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`,
            }),
          5000 // Cache for 5 seconds
        );

        if (__DEV__) {
          console.log('✅ Location updated successfully');
        }

        onSuccess?.();
      } catch (error: any) {
        // Don't log rate limit errors (they're expected)
        if (error?.status === 429 || error?.response?.status === 429) {
          if (__DEV__) {
            console.log('⏳ Rate limited, will retry later');
          }
        } else {
          console.error('❌ Location update failed:', error?.message);
          onError?.(error);
        }
      } finally {
        updateInProgressRef.current = false;
      }
    },
    [shouldUpdate, onSuccess, onError]
  );

  const reset = useCallback(() => {
    lastUpdateRef.current = 0;
    lastLocationRef.current = null;
    updateInProgressRef.current = false;
    requestManager.clear('location-update');
  }, []);

  return { updateLocation, reset };
}
