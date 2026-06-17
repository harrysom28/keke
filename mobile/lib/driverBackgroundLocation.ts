import * as Location from "expo-location";

export const DRIVER_LOCATION_TASK = "keke-driver-background-location";

let taskRegistrationAttempted = false;
let taskManagerAvailable = false;

/** Register the background task lazily so missing ExpoTaskManager native code cannot crash startup. */
export async function ensureDriverLocationTaskRegistered(): Promise<boolean> {
  if (taskRegistrationAttempted) {
    return taskManagerAvailable;
  }
  taskRegistrationAttempted = true;

  try {
    const TaskManager = await import("expo-task-manager");
    if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
      TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
        if (error) {
          console.warn("[driver-bg-location] task error:", error.message);
          return;
        }

        const locations = (
          data as {
            locations?: { coords: { latitude: number; longitude: number } }[];
          }
        )?.locations;
        const latest = locations?.[locations.length - 1];
        const latitude = latest?.coords?.latitude;
        const longitude = latest?.coords?.longitude;

        if (
          latitude == null ||
          longitude == null ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude === 0 ||
          longitude === 0
        ) {
          return;
        }

        try {
          const { syncDriverLocationToServer } = await import(
            "@/utils/driverLocationSync"
          );
          await syncDriverLocationToServer({ latitude, longitude });
        } catch (e) {
          console.warn("[driver-bg-location] sync failed:", e);
        }
      });
    }
    taskManagerAvailable = true;
    return true;
  } catch (e) {
    console.warn(
      "[driver-bg-location] TaskManager unavailable (rebuild native app after adding expo-task-manager):",
      e
    );
    taskManagerAvailable = false;
    return false;
  }
}

export async function isDriverBackgroundLocationRunning(): Promise<boolean> {
  if (!taskManagerAvailable) {
    return false;
  }
  try {
    return await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function startDriverBackgroundLocation(): Promise<boolean> {
  const registered = await ensureDriverLocationTaskRegistered();
  if (!registered) {
    return false;
  }

  try {
    if (await isDriverBackgroundLocationRunning()) {
      return true;
    }

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== Location.PermissionStatus.GRANTED) {
      return false;
    }

    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      distanceInterval: 40,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Keke Ride — online",
        notificationBody: "Sharing your location to receive ride requests",
        notificationColor: "#3C8F7C",
      },
    });
    return true;
  } catch (e) {
    console.warn("[driver-bg-location] start failed:", e);
    return false;
  }
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  if (!taskManagerAvailable) {
    return;
  }
  try {
    if (await isDriverBackgroundLocationRunning()) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch (e) {
    console.warn("[driver-bg-location] stop failed:", e);
  }
}
