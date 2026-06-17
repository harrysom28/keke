import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { LOCATION_UPDATE } from "@/constants";
import apiClient from "@/utils/apiClient";

const HEARTBEAT_MS = 30_000;

type Coords = {
  latitude: number;
  longitude: number;
  address?: string;
};

/**
 * PATCH driver location every 30s while online.
 * Refreshes Mongo `currentLocation.lastUpdated` so discovery excludes stale drivers.
 *
 * Prefer `useDriverSession` in driver layout for background-safe heartbeats;
 * this hook remains for screen-scoped foreground updates with live map coords.
 */
export function useDriverOnlineHeartbeat(
  enabled: boolean,
  _isFocused: boolean,
  coords: Coords | null | undefined
) {
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const sendHeartbeat = useCallback(async () => {
    const c = coordsRef.current;
    if (!c) return;
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      return;
    }
    try {
      await apiClient.patch(LOCATION_UPDATE, {
        latitude: lat,
        longitude: lng,
        address: c.address ?? "",
      });
    } catch {
      // Heartbeat is best-effort; location debounce on map screen may also update.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void sendHeartbeat();

    const intervalId = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_MS);

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active" && enabled) {
        void sendHeartbeat();
      }
    });

    return () => {
      clearInterval(intervalId);
      sub.remove();
    };
  }, [enabled, sendHeartbeat]);
}
