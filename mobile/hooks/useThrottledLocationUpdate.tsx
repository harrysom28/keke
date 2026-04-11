/**
 * Throttled Location Update Hook
 * Debounces location updates to max once per 10 seconds to prevent rate limiting
 */

import { useRef, useCallback } from 'react';
import apiClient from '@/utils/apiClient';

const THROTTLE_MS = 10000; // 10 seconds

export const useThrottledLocationUpdate = () => {
  const lastUpdateRef = useRef<number>(0);

  const updateLocation = useCallback(async (location: {
    name?: string;
    lat: number;
    long: number;
  }) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < THROTTLE_MS) {
      console.log('⏭️ Skipping location update (throttled)');
      return;
    }

    // Validate coordinates before sending
    if (
      typeof location.lat !== 'number' ||
      typeof location.long !== 'number' ||
      isNaN(location.lat) ||
      isNaN(location.long)
    ) {
      console.warn('Invalid coordinates, skipping location update:', location);
      return;
    }

    // Validate name/address - ensure it's a string
    const address = location.name && typeof location.name === 'string' 
      ? location.name 
      : `Location (${location.lat.toFixed(6)}, ${location.long.toFixed(6)})`;

    lastUpdateRef.current = now;
    
    try {
      await apiClient.patch('update/locations/drivers-passengers', {
        latitude: location.lat,
        longitude: location.long,
        address: address,
      });
      console.log('✅ Location updated');
    } catch (error: any) {
      if (error?.response?.status === 429) {
        console.log('⏳ Rate limited, will retry later');
      } else if (error?.response?.status !== 401) {
        if (__DEV__) {
          console.warn('Location update failed (non-critical):', error?.response?.data || error?.message);
        }
      }
    }
  }, []);

  return updateLocation;
};
