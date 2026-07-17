import * as Location from "expo-location";

import { bearingBetweenDegrees, haversineMeters } from "@/utils/haversine";

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** Clockwise from true north; from OS heading when valid, else derived from GPS movement. */
  heading: number | null;
}

type Listener = (update: LocationUpdate) => void;

class LocationEngineClass {
  private listeners = new Set<Listener>();
  private subscription: Location.LocationSubscription | null = null;
  private isWatching = false;
  private prev: { latitude: number; longitude: number } | null = null;

  subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(update: LocationUpdate): void {
    this.listeners.forEach((cb) => {
      try {
        cb(update);
      } catch (e) {
        // no-op
      }
    });
  }

  async start(): Promise<boolean> {
    if (this.isWatching) return true;

    let permission = await Location.getForegroundPermissionsAsync();
    const osCanPrompt =
      permission.status === Location.PermissionStatus.UNDETERMINED ||
      (permission.status === Location.PermissionStatus.DENIED &&
        permission.canAskAgain !== false);
    if (osCanPrompt) {
      // Play "Prominent Disclosure" policy: never trigger the OS location
      // dialog before the in-app disclosure has been accepted.
      const { isLocationDisclosureRequired } = await import(
        "@/utils/locationDisclosure"
      );
      if (await isLocationDisclosureRequired()) {
        return false;
      }
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) return false;
    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 2000,
      },
      (loc) => {
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        const rawH = loc.coords.heading;
        const speed = loc.coords.speed;

        let heading: number | null = null;

        if (typeof rawH === "number" && rawH >= 0) {
          heading = ((rawH % 360) + 360) % 360;
        } else if (this.prev) {
          const dist = haversineMeters(this.prev, { latitude: lat, longitude: lng });
          const speedMps = typeof speed === "number" && !Number.isNaN(speed) ? speed : 0;
          const likelyMoving = speedMps >= 0.25;
          const movedEnough = dist >= 0.6 && (likelyMoving || dist >= 1.8);
          if (movedEnough) {
            heading = bearingBetweenDegrees(this.prev, { latitude: lat, longitude: lng });
          }
        }

        this.prev = { latitude: lat, longitude: lng };

        this.emit({
          latitude: lat,
          longitude: lng,
          accuracy: loc.coords.accuracy ?? 0,
          heading,
        });
      }
    );
    this.isWatching = true;
    return true;
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.isWatching = false;
    this.prev = null;
  }

  get isActive(): boolean {
    return this.isWatching;
  }
}

export const LocationEngine = new LocationEngineClass();
