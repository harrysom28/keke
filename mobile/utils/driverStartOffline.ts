import apiClient from "@/utils/apiClient";
import { stopDriverBackgroundLocation } from "@/lib/driverBackgroundLocation";

async function patchDriverOffline(): Promise<void> {
  try {
    await apiClient.patch("driver/availability", { isAvailable: false });
  } catch {
    // Not verified / no driver profile — ignore.
  }
  try {
    await stopDriverBackgroundLocation();
  } catch {
    // ignore
  }
}

/** Force offline now (logout, account switch). Do not call on app restart. */
export function forceDriverOfflineNow(): Promise<void> {
  return patchDriverOffline();
}
