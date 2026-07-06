import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LocationAccessPurpose } from "@/utils/locationPermission";

const PENDING_KEY = "keke_pending_location_disclosure";

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
