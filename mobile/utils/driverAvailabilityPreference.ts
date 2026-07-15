import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFERS_OFFLINE_KEY = "keke_driver_prefers_offline";

/**
 * Drivers are online by default. Set only when the driver voluntarily goes
 * offline via the toggle, so the app stops auto-onlining them at launch.
 */
export async function getDriverPrefersOffline(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREFERS_OFFLINE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setDriverPrefersOffline(prefersOffline: boolean): Promise<void> {
  try {
    if (prefersOffline) {
      await AsyncStorage.setItem(PREFERS_OFFLINE_KEY, "1");
    } else {
      await AsyncStorage.removeItem(PREFERS_OFFLINE_KEY);
    }
  } catch (e) {
    console.warn("Could not persist driver availability preference:", e);
  }
}
