import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

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

export async function setLocationDisclosureResponse(
  response: LocationDisclosureResponse
): Promise<void> {
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

async function isForegroundPermissionUndetermined(): Promise<boolean> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    return permission.status === Location.PermissionStatus.UNDETERMINED;
  } catch {
    return false;
  }
}

/**
 * Play policy: the prominent disclosure must be shown (and accepted) before the
 * OS location permission dialog. Required while the OS permission is still
 * undetermined and the user has not accepted the disclosure.
 */
export async function isLocationDisclosureRequired(): Promise<boolean> {
  if ((await getLocationDisclosureResponse()) === "accepted") {
    return false;
  }
  return isForegroundPermissionUndetermined();
}

/**
 * Auto-show on launch (e.g. after login) only when the user has never answered
 * the disclosure, so a user who tapped Deny is not nagged every session.
 * Permission flows re-trigger it explicitly via requestLocationDisclosure().
 */
export async function shouldAutoShowLocationDisclosure(): Promise<boolean> {
  if ((await getLocationDisclosureResponse()) != null) {
    return false;
  }
  return isForegroundPermissionUndetermined();
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
