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
      "Keke uses your location to show your position on the map and find nearby drivers when you book a ride.",
    deniedTitle: "Location access needed",
    deniedBody:
      "Enable location for Keke in Settings to see your position on the map and book rides.",
    servicesTitle: "Turn on location services",
    servicesBody:
      "Location Services are turned off on this device. Turn them on to use the map and book rides.",
  },
  driver: {
    rationaleTitle: "Location access",
    rationaleBody:
      "Keke needs your location while you are online so riders can find you and you can receive trip requests.",
    deniedTitle: "Location access needed",
    deniedBody:
      "Enable location for Keke in Settings to go online and receive ride requests.",
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

  if (permission.status === Location.PermissionStatus.UNDETERMINED) {
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
    current.canAskAgain === false
  ) {
    await openLocationSettings();
    return false;
  }

  const result = await ensureForegroundLocationAccess(purpose, {
    showRationale: true,
  });
  return result.granted && result.servicesEnabled;
}
