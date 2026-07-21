import apiClient from "@/utils/apiClient";
import { stopDriverBackgroundLocation } from "@/lib/driverBackgroundLocation";

let bootPromise: Promise<void> | null = null;

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

/** Reset so the next driver session entry forces offline again (e.g. after login). */
export function resetDriverOfflineBoot(): void {
  bootPromise = null;
}

/**
 * Once per app launch (or after reset): ensure the driver starts offline so they
 * must flip Online themselves and see location prompts.
 */
export function ensureDriverStartsOfflineOnce(): Promise<void> {
  if (!bootPromise) {
    bootPromise = patchDriverOffline();
  }
  return bootPromise;
}

/** Always force offline now (call on successful driver login). */
export function forceDriverOfflineNow(): Promise<void> {
  bootPromise = patchDriverOffline();
  return bootPromise;
}
