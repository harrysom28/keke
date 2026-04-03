/**
 * useRoute: production route hook with debounce, cache, loading, ETA/distance.
 * useDriverRoute: same but reroutes when driver deviates >80m from polyline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchRoute,
  distanceFromPointToPolyline,
  type RouteResult,
} from '@/services/routeService';
import type { LatLng } from '@/utils/polylineDecoder';

const DEBOUNCE_MS = 400;
const EMPTY_COORDS: LatLng[] = [];

export interface UseRouteOptions {
  enabled?: boolean;
}

export interface UseRouteResult {
  routeCoords: LatLng[];
  eta: string;
  distance: string;
  loading: boolean;
  durationSeconds: number;
  distanceMeters: number;
}

function isValidCoord(c: { latitude: number; longitude: number } | undefined): boolean {
  if (!c) return false;
  const { latitude, longitude } = c;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    latitude !== 0 &&
    longitude !== 0 &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 1 && longitude === 1)
  );
}

export function useRoute(
  pickup: { latitude: number; longitude: number } | undefined,
  destination: { latitude: number; longitude: number } | undefined,
  options: UseRouteOptions = {}
): UseRouteResult {
  const { enabled = true } = options;
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const key = useMemo(() => {
    if (!pickup || !destination) return '';
    return `${pickup.latitude.toFixed(5)},${pickup.longitude.toFixed(5)}-${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude]);

  const shouldFetch = enabled && key !== '' && isValidCoord(pickup) && isValidCoord(destination);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!shouldFetch) {
      setLoading(false);
      setResult(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setLoading(true);
      fetchRoute(pickup!, destination!)
        .then((data) => {
          if (cancelled || !mountedRef.current) return;
          setResult(data);
        })
        .catch(() => {
          if (cancelled || !mountedRef.current) return;
          setResult(null);
        })
        .finally(() => {
          if (!cancelled && mountedRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (mountedRef.current) {
        setLoading(false);
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [key, shouldFetch, pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude]);

  return useMemo((): UseRouteResult => {
    if (!shouldFetch) {
      return {
        routeCoords: EMPTY_COORDS,
        eta: '',
        distance: '',
        loading: false,
        durationSeconds: 0,
        distanceMeters: 0,
      };
    }
    return {
      routeCoords: result?.routeCoords ?? EMPTY_COORDS,
      eta: result?.eta ?? '',
      distance: result?.distance ?? '',
      loading,
      durationSeconds: result?.durationSeconds ?? 0,
      distanceMeters: result?.distanceMeters ?? 0,
    };
  }, [shouldFetch, result, loading]);
}

const DEVIATION_THRESHOLD_METERS = 80;
const DRIVER_REROUTE_DEBOUNCE_MS = 1500;

/**
 * useDriverRoute: for driver app. Reroutes when driver position deviates >80m from current route.
 */
export function useDriverRoute(
  driverLocation: { latitude: number; longitude: number } | undefined,
  destination: { latitude: number; longitude: number } | undefined,
  options: UseRouteOptions = {}
): UseRouteResult {
  const { enabled = true } = options;
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const lastOriginRef = useRef<string>('');
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const destKey = useMemo(() => {
    if (!destination) return '';
    return `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
  }, [destination?.latitude, destination?.longitude]);

  const shouldFetch =
    enabled &&
    destKey !== '' &&
    isValidCoord(driverLocation) &&
    isValidCoord(destination);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const destinationRef = useRef(destination);
  destinationRef.current = destination;

  const doFetch = useCallback(
    (origin: { latitude: number; longitude: number }) => {
      const dest = destinationRef.current;
      if (!dest || !mountedRef.current) return;
      const key = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}-${destKey}`;
      if (lastOriginRef.current === key) return;
      lastOriginRef.current = key;
      setLoading(true);
      fetchRoute(origin, dest)
        .then((data) => {
          if (mountedRef.current) setResult(data);
        })
        .catch(() => {
          if (mountedRef.current) setResult(null);
        })
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });
    },
    [destKey]
  );

  useEffect(() => {
    if (!shouldFetch || !driverLocation || !destination) {
      setLoading(false);
      setResult(null);
      lastOriginRef.current = '';
      return;
    }

    if (!result || result.routeCoords.length === 0) {
      doFetch(driverLocation);
      return;
    }

    const meters = distanceFromPointToPolyline(driverLocation, result.routeCoords);
    if (meters > DEVIATION_THRESHOLD_METERS) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        doFetch(driverLocation);
      }, DRIVER_REROUTE_DEBOUNCE_MS);
    }

    return () => {
      if (mountedRef.current) {
        setLoading(false);
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [
    shouldFetch,
    driverLocation?.latitude,
    driverLocation?.longitude,
    destination?.latitude,
    destination?.longitude,
    result?.routeCoords,
    doFetch,
  ]);

  return useMemo((): UseRouteResult => {
    if (!shouldFetch) {
      return {
        routeCoords: EMPTY_COORDS,
        eta: '',
        distance: '',
        loading: false,
        durationSeconds: 0,
        distanceMeters: 0,
      };
    }
    return {
      routeCoords: result?.routeCoords ?? EMPTY_COORDS,
      eta: result?.eta ?? '',
      distance: result?.distance ?? '',
      loading,
      durationSeconds: result?.durationSeconds ?? 0,
      distanceMeters: result?.distanceMeters ?? 0,
    };
  }, [shouldFetch, result, loading]);
}
