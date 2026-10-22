import { LOCATION_UPDATE } from "@/constants";
import apiClient from "@/utils/apiClient";

/** Push driver GPS to the backend. `capturedAt` is what sets `lastRealFixAt`. */
export async function syncDriverLocationToServer(coords: {
  latitude: number;
  longitude: number;
  address?: string;
  accuracy?: number | null;
  capturedAt?: number | null;
}): Promise<boolean> {
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return false;
  }
  const accuracy = coords.accuracy == null ? undefined : Number(coords.accuracy);
  const capturedAt = coords.capturedAt == null ? undefined : Number(coords.capturedAt);
  try {
    await apiClient.patch(LOCATION_UPDATE, {
      latitude: lat,
      longitude: lng,
      address: coords.address ?? "",
      ...(Number.isFinite(accuracy) ? { accuracy } : {}),
      ...(Number.isFinite(capturedAt) ? { capturedAt } : {}),
    });
    return true;
  } catch {
    return false;
  }
}
