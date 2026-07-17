import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";

import type { LocationAccessPurpose } from "@/utils/locationPermission";

const PENDING_KEY = "keke_pending_location_disclosure";
const RESPONSE_KEY = "keke_location_disclosure_response";

export type LocationDisclosureResponse = "accepted" | "denied";

export async function markLocationDisclosurePending(
  purpose: LocationAccessPurpose
): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, purpose);
  } catch (e) {
    console.warn("Could not persist location disclosure flag:", e);
  }
}

export async function getPendingLocationDisclosure(): Promise<LocationAccessPurpose | null> {
  try {
    const value = await AsyncStorage.getItem(PENDING_KEY);
    if (value === "rider" || value === "driver") {
      return value;
    }
  } catch (e) {
    console.warn("Could not read location disclosure flag:", e);
  }
  return null;
}

export async function isLocationDisclosurePending(): Promise<boolean> {
  return (await getPendingLocationDisclosure()) != null;
}

export async function clearLocationDisclosurePending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (e) {
    console.warn("Could not clear location disclosure flag:", e);
  }
}

/**
 * In-memory only, so a backup-restored AsyncStorage value can never satisfy
 * it. Set when the user accepts the disclosure in the current app session.
 */
let acceptedThisSession = false;

export async function setLocationDisclosureResponse(
  response: LocationDisclosureResponse
): Promise<void> {
  if (response === "accepted") {
    acceptedThisSession = true;
  }
  try {
    await AsyncStorage.setItem(RESPONSE_KEY, response);
  } catch (e) {
    console.warn("Could not persist location disclosure response:", e);
  }
}

export async function getLocationDisclosureResponse(): Promise<LocationDisclosureResponse | null> {
  try {
    const value = await AsyncStorage.getItem(RESPONSE_KEY);
    if (value === "accepted" || value === "denied") {
      return value;
    }
  } catch (e) {
    console.warn("Could not read location disclosure response:", e);
  }
  return null;
}

async function clearLocationDisclosureResponse(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RESPONSE_KEY);
  } catch (e) {
    console.warn("Could not clear location disclosure response:", e);
  }
}

/**
 * True when we should still run the disclosure → OS permission flow.
 *
 * Covers:
 * - UNDETERMINED
 * - DENIED + canAskAgain (Settings "Not allowed", first ask on many devices)
 * - Android DENIED + canAskAgain:false before the user was ever asked (OEM quirk;
 *   same class of bug we already handle for notification permission)
 *
 * False only when already granted, or iOS permanently denied.
 */
export async function canPromptOsLocationPermission(): Promise<boolean> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status === Location.PermissionStatus.GRANTED) {
      return false;
    }
    if (permission.status === Location.PermissionStatus.UNDETERMINED) {
      return true;
    }
    if (permission.canAskAgain !== false) {
      return true;
    }
    // Some Android OEMs report canAskAgain:false before the first ask.
    // Still attempt disclosure + request; if the OS won't show a dialog,
    // the permission helpers fall through to Settings.
    if (Platform.OS === "android") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Play policy: the prominent disclosure must be shown (and accepted) before the
 * OS location permission dialog. Required whenever we can still prompt and the
 * disclosure wasn't accepted in this app session.
 */
export async function isLocationDisclosureRequired(): Promise<boolean> {
  if (acceptedThisSession) {
    return false;
  }
  return canPromptOsLocationPermission();
}

/**
 * Auto-show on launch unless the user tapped Deny on the disclosure.
 * If they previously accepted but OS permission was reset to undetermined
 * (reinstall / backup), re-show so the OS dialog is never skipped.
 */
export async function shouldAutoShowLocationDisclosure(): Promise<boolean> {
  const response = await getLocationDisclosureResponse();
  if (response === "denied") {
    return false;
  }

  const permission = await Location.getForegroundPermissionsAsync().catch(
    () => null
  );
  if (!permission || permission.status === Location.PermissionStatus.GRANTED) {
    return false;
  }

  if (response === "accepted") {
    // Only re-show when OS permission was wiped back to undetermined.
    return permission.status === Location.PermissionStatus.UNDETERMINED;
  }

  return canPromptOsLocationPermission();
}

/**
 * Call after successful login/signup so the disclosure host always has a
 * pending flag to show, independent of racey auto-show checks.
 */
export async function queueLocationDisclosureIfNeeded(
  purpose: LocationAccessPurpose
): Promise<void> {
  if (!(await canPromptOsLocationPermission())) {
    return;
  }
  // New auth session: clear a prior Deny so login can present disclosure again.
  await clearLocationDisclosureResponse();
  await markLocationDisclosurePending(purpose);
  try {
    const { resetAutoLocationPromptGate } = await import(
      "@/hooks/useCurrentLocation"
    );
    resetAutoLocationPromptGate();
  } catch {
    // optional — host still shows from pending flag
  }
  disclosureListeners.forEach((listener) => listener(purpose));
}

type DisclosureListener = (purpose: LocationAccessPurpose) => void;
const disclosureListeners = new Set<DisclosureListener>();

/** LocationDisclosureHost subscribes to show the modal when a flow needs it. */
export function subscribeLocationDisclosureRequests(
  listener: DisclosureListener
): () => void {
  disclosureListeners.add(listener);
  return () => {
    disclosureListeners.delete(listener);
  };
}

/**
 * Ask the disclosure host to present the prominent disclosure modal. Used by
 * permission flows that would otherwise show the OS dialog directly.
 */
export async function requestLocationDisclosure(
  purpose: LocationAccessPurpose
): Promise<void> {
  await markLocationDisclosurePending(purpose);
  disclosureListeners.forEach((listener) => listener(purpose));
}
