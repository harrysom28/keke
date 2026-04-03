/**
 * Route service: OSRM via backend (Open Source Routing Machine).
 * Uses backend /maps/directions which returns polyline geometry from OSRM; no Google APIs.
 */

import apiClient from '@/utils/apiClient';
import { decodePolyline } from '@/utils/polylineDecoder';
import type { LatLng } from '@/utils/polylineDecoder';

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Minimum distance in meters from point to polyline (closest point on any segment). */
export function distanceFromPointToPolyline(
  point: { latitude: number; longitude: number },
  polyline: LatLng[]
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineKm(
      point.latitude,
      point.longitude,
      polyline[0].latitude,
      polyline[0].longitude
    ) * 1000;
  }
  let minMeters = Infinity;
  const px = point.latitude;
  const py = point.longitude;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.latitude;
    const ay = a.longitude;
    const bx = b.latitude;
    const by = b.longitude;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) /
          (((bx - ax) ** 2 + (by - ay) ** 2) || 1)
      )
    );
    const qx = ax + t * (bx - ax);
    const qy = ay + t * (by - ay);
    const d = haversineKm(px, py, qx, qy) * 1000;
    if (d < minMeters) minMeters = d;
  }
  return minMeters;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const routeCache = new Map<
  string,
  { data: RouteResult; at: number }
>();

export interface RouteResult {
  routeCoords: LatLng[];
  eta: string;
  distance: string;
  durationSeconds: number;
  distanceMeters: number;
}

function cacheKey(
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number
): string {
  const p = (n: number) => n.toFixed(5);
  return `route:${p(pickupLat)}:${p(pickupLng)}:${p(destLat)}:${p(destLng)}`;
}

function getCached(key: string): RouteResult | null {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: RouteResult): void {
  routeCache.set(key, { data, at: Date.now() });
}

/**
 * Fetch driving route from OSRM via backend.
 * Backend returns polyline (array of {latitude, longitude}) or overview_polyline (encoded).
 * Returns decoded polyline, ETA text, distance text; uses in-memory cache by coords.
 */
export async function fetchRoute(
  pickup: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): Promise<RouteResult | null> {
  const key = cacheKey(
    pickup.latitude,
    pickup.longitude,
    destination.latitude,
    destination.longitude
  );
  const cached = getCached(key);
  if (cached) return cached;

  const originStr = `${pickup.latitude},${pickup.longitude}`;
  const destStr = `${destination.latitude},${destination.longitude}`;

  try {
    const response = await apiClient.get('maps/directions', {
      params: { origin: originStr, destination: destStr },
    });
    const dataResp = response?.data?.data ?? response?.data;
    const routes = dataResp?.routes;
    if (!routes?.length) return null;

    const route = routes[0];
    const leg = route.legs?.[0];
    let routeCoords: LatLng[] = [];

    if (Array.isArray(route.polyline) && route.polyline.length > 0) {
      routeCoords = route.polyline.map((p: { latitude: number; longitude: number }) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      }));
    } else {
      const encoded = route.overview_polyline?.points ?? (typeof route.overview_polyline === 'string' ? route.overview_polyline : '');
      if (encoded) routeCoords = decodePolyline(encoded);
    }

    const durationSeconds = leg?.duration?.value ?? 0;
    const distanceMeters = leg?.distance?.value ?? 0;
    const eta = leg?.duration?.text ?? (durationSeconds ? `${Math.round(durationSeconds / 60)} min` : '');
    const distance = leg?.distance?.text ?? (distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : '');

    const data: RouteResult = {
      routeCoords,
      eta,
      distance,
      durationSeconds,
      distanceMeters,
    };
    setCached(key, data);
    return data;
  } catch {
    return null;
  }
}
