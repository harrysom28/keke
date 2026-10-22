import { LOCATION_UPDATE } from "@/constants";
import apiClient from "@/utils/apiClient";

/** Push driver GPS to the backend so Mongo `lastUpdated` stays fresh for rider discovery. */
export async function syncDriverLocationToServer(coords: {
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<boolean> {
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return false;
  }
  try {
    await apiClient.patch(LOCATION_UPDATE, {
      latitude: lat,
      longitude: lng,
      address: coords.address ?? "",
    });
    return true;
  } catch {
    return false;
  }
}
