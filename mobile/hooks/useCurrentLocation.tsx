import * as Location from "expo-location";

import { useCallback, useEffect, useRef, useState } from "react";

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
  locationError: string;
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
  locationError: "",
  loading: true,
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

async function ensureSharedLocationStarted() {
  if (sharedWatchSubscription || sharedStartPromise) {
    if (sharedStartPromise) {
      await sharedStartPromise;
    }
    return;
  }

  sharedStartPromise = (async () => {
    console.log("📍 Starting location watch");
    publishSharedSnapshot({ loading: true, locationError: "" });

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      publishSharedSnapshot({
        locationError: "Permission to access location was denied",
        loading: false,
      });
      return;
    }

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
      } catch (getCurrentError: any) {
        console.warn(`⚠️ Location attempt ${attempts + 1} failed:`, getCurrentError?.message || getCurrentError);
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
        publishSharedSnapshot({ location: coordsToUse });
        await reverseGeocodeAndPublish(coordsToUse);
      }
    );
  })()
    .catch((err) => {
      publishSharedSnapshot({
        locationError: "Failed to start location watch",
      });
      console.error("❌ Location error:", err);
    })
    .finally(() => {
      publishSharedSnapshot({ loading: false });
      sharedStartPromise = null;
    });

  await sharedStartPromise;
}

function stopSharedLocationIfUnused() {
  if (sharedConsumers <= 0 && sharedWatchSubscription) {
    sharedWatchSubscription.remove();
    sharedWatchSubscription = null;
    sharedBestAccuracy = Infinity;
    console.log("📍 Location watch stopped");
  }
}

export function useCurrentLocation({ isFocused }: { isFocused: boolean }) {
  const [location, setLocation] = useState<Location.LocationObjectCoords>(sharedSnapshot.location);
  const [locationError, setLocationError] = useState(sharedSnapshot.locationError);
  const [address, setAddress] = useState<Location.LocationGeocodedAddress>(sharedSnapshot.address);
  const [loading, setLoading] = useState(sharedSnapshot.loading);
  const isSubscribedRef = useRef(false);

  const getLocation = useCallback(async () => {
    await ensureSharedLocationStarted();
  }, []);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;
    const listener = (nextSnapshot: SharedSnapshot) => {
      setLocation(nextSnapshot.location);
      setAddress(nextSnapshot.address);
      setLocationError(nextSnapshot.locationError);
      setLoading(nextSnapshot.loading);
    };
    sharedListeners.add(listener);
    listener(sharedSnapshot);
    return () => {
      sharedListeners.delete(listener);
      isSubscribedRef.current = false;
    };
  }, []);

  // Automatically start location tracking on mount
  useEffect(() => {
    if (isFocused) {
      sharedConsumers += 1;
      (async () => {
        await getLocation();
      })();

      return () => {
        sharedConsumers = Math.max(0, sharedConsumers - 1);
        stopSharedLocationIfUnused();
      };
    }
  }, [getLocation, isFocused]);

  return { location, address, locationError, loading, getLocation };
}
