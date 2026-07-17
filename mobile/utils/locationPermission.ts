import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

export type LocationAccessPurpose = "rider" | "driver";

export type LocationAccessResult = {
  granted: boolean;
  servicesEnabled: boolean;
  /** False after user denied and OS will not show the dialog again. */
  canAskAgain: boolean;
  status: Location.PermissionStatus | "services_disabled";
};

const COPY: Record<
  LocationAccessPurpose,
  {
    rationaleTitle: string;
    rationaleBody: string;
    deniedTitle: string;
    deniedBody: string;
    servicesTitle: string;
    servicesBody: string;
  }
> = {
  rider: {
    rationaleTitle: "Location access",
    rationaleBody:
      "Keke Ride uses your location to show your position on the map and find nearby drivers when you book a ride.",
    deniedTitle: "Location access needed",
    deniedBody:
      "Enable location for Keke Ride in Settings to see your position on the map and book rides.",
    servicesTitle: "Turn on location services",
    servicesBody:
      "Location Services are turned off on this device. Turn them on to use the map and book rides.",
  },
  driver: {
    rationaleTitle: "Location access",
    rationaleBody:
      "Keke Ride needs your location while you are online so riders can find you and you can receive trip requests.",
    deniedTitle: "Location access needed",
    deniedBody:
      "Enable location for Keke Ride in Settings to go online and receive ride requests.",
    servicesTitle: "Turn on location services",
    servicesBody:
      "Location Services are turned off. Turn them on before going online or opening the driver map.",
  },
};

export async function openLocationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (e) {
    console.warn("Could not open settings:", e);
  }
}

function showServicesDisabledAlert(purpose: LocationAccessPurpose): Promise<void> {
  const copy = COPY[purpose];
  return new Promise((resolve) => {
    Alert.alert(copy.servicesTitle, copy.servicesBody, [
      { text: "Not now", style: "cancel", onPress: () => resolve() },
      {
        text: "Open Settings",
        onPress: () => {
          void openLocationSettings();
          resolve();
        },
      },
    ]);
  });
}

function showRationaleAlert(purpose: LocationAccessPurpose): Promise<boolean> {
  const copy = COPY[purpose];
  return new Promise((resolve) => {
    Alert.alert(copy.rationaleTitle, copy.rationaleBody, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) },
    ]);
  });
}

export function showLocationDeniedAlert(purpose: LocationAccessPurpose): void {
  const copy = COPY[purpose];
  Alert.alert(copy.deniedTitle, copy.deniedBody, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void openLocationSettings() },
  ]);
}

/**
 * Ensures foreground location permission (and that device location services are on).
 * @param showRationale — show an in-app explanation before the OS permission dialog (best for go-online, etc.)
 */
export async function ensureForegroundLocationAccess(
  purpose: LocationAccessPurpose,
  options: { showRationale?: boolean } = {}
): Promise<LocationAccessResult> {
  const { showRationale = false } = options;

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    if (showRationale) {
      await showServicesDisabledAlert(purpose);
    }
    return {
      granted: false,
      servicesEnabled: false,
      canAskAgain: true,
      status: "services_disabled",
    };
  }

  let permission = await Location.getForegroundPermissionsAsync();

  // Keep in sync with canPromptOsLocationPermission (Android OEMs may report
  // DENIED + canAskAgain:false before the user was ever asked).
  const osCanPrompt =
    permission.status === Location.PermissionStatus.UNDETERMINED ||
    (permission.status !== Location.PermissionStatus.GRANTED &&
      (permission.canAskAgain !== false || Platform.OS === "android"));

  if (osCanPrompt) {
    // Play "Prominent Disclosure" policy: the in-app disclosure must be shown
    // and accepted before the OS location dialog ever appears. Defer to the
    // disclosure modal (LocationDisclosureHost) if the user hasn't accepted it.
    const { isLocationDisclosureRequired, requestLocationDisclosure } =
      await import("@/utils/locationDisclosure");
    if (await isLocationDisclosureRequired()) {
      await requestLocationDisclosure(purpose);
      return {
        granted: false,
        servicesEnabled: true,
        canAskAgain: true,
        status: permission.status,
      };
    }

    if (showRationale) {
      const proceed = await showRationaleAlert(purpose);
      if (!proceed) {
        return {
          granted: false,
          servicesEnabled: true,
          canAskAgain: true,
          status: permission.status,
        };
      }
    }
    permission = await Location.requestForegroundPermissionsAsync();
  }

  const granted = permission.status === Location.PermissionStatus.GRANTED;
  const canAskAgain =
    permission.canAskAgain !== false &&
    permission.status !== Location.PermissionStatus.DENIED;

  if (!granted && showRationale && !canAskAgain) {
    showLocationDeniedAlert(purpose);
  }

  return {
    granted,
    servicesEnabled: true,
    canAskAgain,
    status: permission.status,
  };
}

/** Banner tap — OS dialog or Settings; no extra in-app Alert (banner is the prompt). */
export async function requestLocationFromBanner(
  purpose: LocationAccessPurpose
): Promise<boolean> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    await showServicesDisabledAlert(purpose);
    return false;
  }

  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === Location.PermissionStatus.GRANTED) {
    return true;
  }

  if (
    current.status === Location.PermissionStatus.DENIED &&
    current.canAskAgain === false &&
    Platform.OS !== "android"
  ) {
    await openLocationSettings();
    return false;
  }

  const access = await ensureForegroundLocationAccess(purpose, {
    showRationale: false,
  });
  return access.granted && access.servicesEnabled;
}

/** Rider/driver home banner action when location is blocked. */
export async function resolveLocationPermissionFromBanner(
  purpose: LocationAccessPurpose
): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === Location.PermissionStatus.GRANTED) {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    return servicesEnabled;
  }

  if (
    current.status === Location.PermissionStatus.DENIED &&
    current.canAskAgain === false &&
    Platform.OS !== "android"
  ) {
    await openLocationSettings();
    return false;
  }

  const result = await ensureForegroundLocationAccess(purpose, {
    showRationale: true,
  });
  return result.granted && result.servicesEnabled;
}

/**
 * Request background location so online drivers stay discoverable when the app
 * is backgrounded or the screen is locked. Call when the driver goes online.
 */
export async function ensureDriverBackgroundLocationAccess(
  options: { showRationale?: boolean } = {}
): Promise<LocationAccessResult> {
  const foreground = await ensureForegroundLocationAccess("driver", options);
  if (!foreground.granted) {
    return foreground;
  }

  let permission = await Location.getBackgroundPermissionsAsync();
  if (permission.status === Location.PermissionStatus.GRANTED) {
    return { ...foreground, granted: true };
  }

  if (permission.status === Location.PermissionStatus.UNDETERMINED) {
    // Play "Prominent Disclosure" policy: always disclose background collection
    // (with the required "even when the app is closed or not in use" wording)
    // before the OS background permission dialog.
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Background location",
        "Keke Ride collects location data while you are online as a driver to enable rider-driver matching, trip requests, and ride tracking, even when the app is closed or not in use. Your location is shared with riders only while you are online or on an active trip.",
        [
          { text: "Not now", style: "cancel", onPress: () => resolve(false) },
          { text: "Continue", onPress: () => resolve(true) },
        ]
      );
    });
    if (!proceed) {
      return { ...foreground, granted: false, canAskAgain: true };
    }
    permission = await Location.requestBackgroundPermissionsAsync();
  }

  const granted = permission.status === Location.PermissionStatus.GRANTED;
  if (!granted && options.showRationale) {
    Alert.alert(
      "Background location needed",
      "To stay online when the app is in the background, enable “Always” or “Allow all the time” location for Keke Ride in Settings.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void openLocationSettings() },
      ]
    );
  }

  return {
    granted,
    servicesEnabled: true,
    canAskAgain: permission.canAskAgain !== false,
    status: permission.status,
  };
}
