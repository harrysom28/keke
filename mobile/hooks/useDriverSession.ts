import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";

import apiClient from "@/utils/apiClient";
import { syncDriverLocationToServer } from "@/utils/driverLocationSync";
import {
  startDriverBackgroundLocation,
  stopDriverBackgroundLocation,
} from "@/lib/driverBackgroundLocation";
import { ensureDriverStartsOfflineOnce } from "@/utils/driverStartOffline";

const ONLINE_POLL_MS = 45_000;
const HEARTBEAT_MS = 30_000;

type Coords = { latitude: number; longitude: number; address?: string };

/**
 * Driver-area session: keeps online status + location heartbeats alive while the
 * driver is online, even when the app is backgrounded or another app is focused.
 */
export function useDriverSession() {
  const [sessionOnline, setSessionOnline] = useState(false);
  const sessionOnlineRef = useRef(false);
  const lastCoordsRef = useRef<Coords | null>(null);
  const heartbeatBusyRef = useRef(false);

  const refreshOnlineStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get("driver/earnings");
      const online = Boolean(data?.data?.is_online);
      sessionOnlineRef.current = online;
      setSessionOnline(online);
      return online;
    } catch {
      sessionOnlineRef.current = false;
      setSessionOnline(false);
      return false;
    }
  }, []);

  const captureCoords = useCallback(async (): Promise<Coords | null> => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== Location.PermissionStatus.GRANTED) {
        return lastCoordsRef.current;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 60_000,
        timeout: 12_000,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat === 0 ||
        lng === 0
      ) {
        return lastCoordsRef.current;
      }
      const coords: Coords = { latitude: lat, longitude: lng };
      lastCoordsRef.current = coords;
      return coords;
    } catch {
      return lastCoordsRef.current;
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (!sessionOnlineRef.current || heartbeatBusyRef.current) {
      return;
    }
    heartbeatBusyRef.current = true;
    try {
      const coords = (await captureCoords()) ?? lastCoordsRef.current;
      if (!coords) {
        return;
      }
      await syncDriverLocationToServer(coords);
    } finally {
      heartbeatBusyRef.current = false;
    }
  }, [captureCoords]);

  const syncSession = useCallback(async () => {
    const online = await refreshOnlineStatus();
    if (online) {
      await startDriverBackgroundLocation();
      await sendHeartbeat();
    } else {
      await stopDriverBackgroundLocation();
    }
  }, [refreshOnlineStatus, sendHeartbeat]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Start each driver app session offline; driver flips Online manually.
      await ensureDriverStartsOfflineOnce();
      if (cancelled) return;
      await syncSession();
    })();

    const pollId = setInterval(() => {
      void syncSession();
    }, ONLINE_POLL_MS);

    const heartbeatId = setInterval(() => {
      if (sessionOnlineRef.current) {
        void sendHeartbeat();
      }
    }, HEARTBEAT_MS);

    const appSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void syncSession();
      } else if (sessionOnlineRef.current) {
        void sendHeartbeat();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(heartbeatId);
      appSub.remove();
      void stopDriverBackgroundLocation();
    };
  }, [sendHeartbeat, syncSession]);

  return { sessionOnline, refreshOnlineStatus };
}
