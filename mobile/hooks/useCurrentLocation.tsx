import * as Location from "expo-location";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  ensureForegroundLocationAccess,
  type LocationAccessPurpose,
} from "@/utils/locationPermission";

// In dev/simulator, iOS/Android often report a fixed US location. Override to Abakaliki so the map shows your intended test region.
const SIMULATOR_DEFAULT_COORDS = [
  { lat: 37.785834, lng: -122.406417 },   // San Francisco (iOS Simulator)
  { lat: 37.7749, lng: -122.4194 },       // San Francisco
  { lat: 37.4219983, lng: -122.084 },     // Google HQ (Android emulator)
];
const ABAKALIKI_COORDS = { latitude: 6.3242, longitude: 8.1136 }; // Abakaliki, Nigeria

function isSimulatorDefault(lat: number, lng: number): boolean {
  return SIMULATOR_DEFAULT_COORDS.some(
    (c) => Math.abs(c.lat - lat) < 0.01 && Math.abs(c.lng - lng) < 0.01
  );
}

function applyDevLocationOverride(coords: Location.LocationObjectCoords): Location.LocationObjectCoords {
  if (typeof __DEV__ === "boolean" && __DEV__ && isSimulatorDefault(coords.latitude, coords.longitude)) {
    console.log("📍 [DEV] Simulator default location detected; using Abakaliki for testing");
    return {
      ...coords,
      latitude: ABAKALIKI_COORDS.latitude,
      longitude: ABAKALIKI_COORDS.longitude,
    };
  }
  return coords;
}

type SharedSnapshot = {
  location: Location.LocationObjectCoords;
  address: Location.LocationGeocodedAddress;
  /** True only when location services are off or foreground permission is denied. */
  locationBlocked: boolean;
  loading: boolean;
};

const EMPTY_LOCATION: Location.LocationObjectCoords = {
  latitude: 0,
  longitude: 0,
  altitude: 0,
  accuracy: 0,
  altitudeAccuracy: 0,
  heading: 0,
  speed: 0,
};

const EMPTY_ADDRESS: Location.LocationGeocodedAddress = {
  city: "",
  district: "",
  streetNumber: "",
  street: "",
  region: "",
  subregion: "",
  country: "",
  postalCode: "",
  name: "",
  isoCountryCode: "",
  timezone: "",
  formattedAddress: "",
};

let sharedSnapshot: SharedSnapshot = {
  location: EMPTY_LOCATION,
  address: EMPTY_ADDRESS,
  locationBlocked: false,
  loading: false,
};

let sharedBestAccuracy = Infinity;
let sharedWatchSubscription: Location.LocationSubscription | null = null;
let sharedStartPromise: Promise<void> | null = null;
let sharedConsumers = 0;
const sharedListeners = new Set<(snapshot: SharedSnapshot) => void>();

function publishSharedSnapshot(patch: Partial<SharedSnapshot>) {
  sharedSnapshot = { ...sharedSnapshot, ...patch };
  sharedListeners.forEach((listener) => listener(sharedSnapshot));
}

async function readLocationBlockedState(): Promise<boolean> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    return true;
  }
  const permission = await Location.getForegroundPermissionsAsync();
  return permission.status === Location.PermissionStatus.DENIED;
}

function resetSharedLocationWatch() {
  if (sharedWatchSubscription) {
    sharedWatchSubscription.remove();
    sharedWatchSubscription = null;
  }
  sharedBestAccuracy = Infinity;
  sharedStartPromise = null;
}

async function reverseGeocodeAndPublish(coords: Location.LocationObjectCoords) {
  try {
    const [address] = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (address) {
      publishSharedSnapshot({ address });
    }
  } catch (geocodeError) {
    console.warn("⚠️ Geocoding failed:", geocodeError);
  }
}

/**
 * Start GPS watch only when foreground permission is already granted.
 * Does NOT show the OS permission dialog — use getLocation({ requestPermission: true }).
 */
async function ensureSharedLocationStarted(
  purpose: LocationAccessPurpose = "rider",
  options: { requestPermission?: boolean; showRationale?: boolean } = {}
) {
  const { requestPermission = false, showRationale = false } = options;

  if (sharedWatchSubscription) {
    publishSharedSnapshot({ locationBlocked: false, loading: false });
    return;
  }
  if (sharedStartPromise) {
    await sharedStartPromise;
    return;
  }

  sharedStartPromise = (async () => {
    publishSharedSnapshot({ loading: true, locationBlocked: false });

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      publishSharedSnapshot({ locationBlocked: true, loading: false });
      return;
    }

    let permission = await Location.getForegroundPermissionsAsync();

    if (
      permission.status !== Location.PermissionStatus.GRANTED &&
      requestPermission
    ) {
      const access = await ensureForegroundLocationAccess(purpose, {
        showRationale,
      });
      if (!access.granted) {
        publishSharedSnapshot({
          locationBlocked:
            access.status === Location.PermissionStatus.DENIED ||
            access.status === "services_disabled",
          loading: false,
        });
        return;
      }
      permission = await Location.getForegroundPermissionsAsync();
    }

    if (permission.status === Location.PermissionStatus.DENIED) {
      publishSharedSnapshot({ locationBlocked: true, loading: false });
      return;
    }

    if (permission.status !== Location.PermissionStatus.GRANTED) {
      // Undetermined — user has not been asked yet; no banner, no OS dialog.
      publishSharedSnapshot({ locationBlocked: false, loading: false });
      return;
    }

    publishSharedSnapshot({ locationBlocked: false });

    console.log("📍 Starting location watch");

    let bestLocation: Location.LocationObject | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && (!bestLocation || (bestLocation.coords.accuracy || Infinity) > 50)) {
      try {
        const currentLocation = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
            maximumAge: attempts === 0 ? 5000 : 0,
            timeout: 10000,
          }),
          new Promise<Location.LocationObject>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 10000)
          ),
        ]);

        const accuracy = currentLocation.coords.accuracy || Infinity;
        if (!bestLocation || accuracy < (bestLocation.coords.accuracy || Infinity)) {
          bestLocation = currentLocation;
          sharedBestAccuracy = accuracy;
        }

        if (accuracy < 20) {
          break;
        }
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (getCurrentError: unknown) {
        const message =
          getCurrentError instanceof Error
            ? getCurrentError.message
            : String(getCurrentError);
        console.warn(`⚠️ Location attempt ${attempts + 1} failed:`, message);
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    if (bestLocation) {
      const coordsToUse = applyDevLocationOverride(bestLocation.coords);
      publishSharedSnapshot({ location: coordsToUse });
      await reverseGeocodeAndPublish(coordsToUse);
    } else {
      console.warn("⚠️ Could not get immediate location, will use watch");
    }

    sharedWatchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 10000,
        distanceInterval: 10,
      },
      async (locationResult) => {
        const accuracy = locationResult.coords.accuracy || Infinity;
        const shouldUpdate =
          accuracy < 100 &&
          (
            sharedBestAccuracy === Infinity ||
            accuracy < sharedBestAccuracy ||
            (sharedBestAccuracy > 50 && accuracy < sharedBestAccuracy * 0.8)
          );

        if (!shouldUpdate) return;

        sharedBestAccuracy = accuracy;
        const coordsToUse = applyDevLocationOverride(locationResult.coords);
        publishSharedSnapshot({ location: coordsToUse, locationBlocked: false });
        await reverseGeocodeAndPublish(coordsToUse);
      }
    );
  })()
    .catch((err) => {
      console.error("❌ Location error:", err);
      // GPS/watch failures are not permission problems — do not show the banner.
      publishSharedSnapshot({ locationBlocked: false });
    })
    .finally(() => {
      publishSharedSnapshot({ loading: false });
      sharedStartPromise = null;
    });

  await sharedStartPromise;
}

async function syncLocationAccessOnFocus(
  purpose: LocationAccessPurpose
): Promise<void> {
  const blocked = await readLocationBlockedState();
  publishSharedSnapshot({ locationBlocked: blocked });

  if (blocked) {
    publishSharedSnapshot({ loading: false });
    return;
  }

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status === Location.PermissionStatus.GRANTED) {
    await ensureSharedLocationStarted(purpose, { requestPermission: false });
  } else {
    publishSharedSnapshot({ loading: false, locationBlocked: false });
  }
}

function stopSharedLocationIfUnused() {
  if (sharedConsumers <= 0 && sharedWatchSubscription) {
    sharedWatchSubscription.remove();
    sharedWatchSubscription = null;
    sharedBestAccuracy = Infinity;
    console.log("📍 Location watch stopped");
  }
}

export function useCurrentLocation({
  isFocused,
  purpose = "rider",
  showRationaleOnRequest = false,
}: {
  isFocused: boolean;
  purpose?: LocationAccessPurpose;
  /** Show in-app rationale before the OS dialog (e.g. driver going online). */
  showRationaleOnRequest?: boolean;
}) {
  const [location, setLocation] = useState<Location.LocationObjectCoords>(sharedSnapshot.location);
  const [locationBlocked, setLocationBlocked] = useState(sharedSnapshot.locationBlocked);
  const [address, setAddress] = useState<Location.LocationGeocodedAddress>(sharedSnapshot.address);
  const [loading, setLoading] = useState(sharedSnapshot.loading);
  const isSubscribedRef = useRef(false);
  const purposeRef = useRef(purpose);
  const rationaleRef = useRef(showRationaleOnRequest);

  useEffect(() => {
    purposeRef.current = purpose;
    rationaleRef.current = showRationaleOnRequest;
  }, [purpose, showRationaleOnRequest]);

  const getLocation = useCallback(
    async (opts?: { showRationale?: boolean; requestPermission?: boolean }) => {
      if (opts?.requestPermission) {
        resetSharedLocationWatch();
      }
      await ensureSharedLocationStarted(purposeRef.current, {
        requestPermission: opts?.requestPermission ?? false,
        showRationale: opts?.showRationale ?? rationaleRef.current,
      });
    },
    []
  );

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;
    const listener = (nextSnapshot: SharedSnapshot) => {
      setLocation(nextSnapshot.location);
      setAddress(nextSnapshot.address);
      setLocationBlocked(nextSnapshot.locationBlocked);
      setLoading(nextSnapshot.loading);
    };
    sharedListeners.add(listener);
    listener(sharedSnapshot);
    return () => {
      sharedListeners.delete(listener);
      isSubscribedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    sharedConsumers += 1;
    void syncLocationAccessOnFocus(purposeRef.current);

    return () => {
      sharedConsumers = Math.max(0, sharedConsumers - 1);
      stopSharedLocationIfUnused();
    };
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        void syncLocationAccessOnFocus(purposeRef.current);
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [isFocused]);

  return {
    location,
    address,
    /** @deprecated use locationBlocked — kept so callers migrating gradually still compile */
    locationError: locationBlocked
      ? "Permission to access location was denied"
      : "",
    locationBlocked,
    loading,
    getLocation,
  };
}
