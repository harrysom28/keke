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
 * PATCH driver location every 30s while online, app is foreground, and screen is focused.
 * Refreshes Mongo `currentLocation.lastUpdated` so discovery excludes stale drivers.
 */
export function useDriverOnlineHeartbeat(
  enabled: boolean,
  isFocused: boolean,
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
    if (!enabled || !isFocused) return;

    const appActive = () => AppState.currentState === "active";
    if (!appActive()) return;

    void sendHeartbeat();

    const intervalId = setInterval(() => {
      if (appActive()) {
        void sendHeartbeat();
      }
    }, HEARTBEAT_MS);

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active" && enabled && isFocused) {
        void sendHeartbeat();
      }
    });

    return () => {
      clearInterval(intervalId);
      sub.remove();
    };
  }, [enabled, isFocused, sendHeartbeat]);
}
