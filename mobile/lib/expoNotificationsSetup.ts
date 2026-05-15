import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";

import { setupNotificationChannels } from "@/utils/notifications";

/**
 * Foreground display for Expo-delivered pushes (backend uses Expo Push API).
 * Without this, notifications may be swallowed while the app is open.
 */
export function configureExpoNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification?.request?.content?.data || {}) as Record<
        string,
        unknown
      >;
      const priority = String(data.priority || "medium");
      const screen = String(data.screen || "");
      const notifType = String(data.type || "");
      const isRideLifecycle =
        screen === "ride" && (notifType === "alert" || notifType === "banner");
      const isHigh = priority === "high" || priority === "critical";
      if ((isHigh || isRideLifecycle) && Platform.OS === "android") {
        Vibration.vibrate(300);
      }
      return {
        shouldShowAlert:
          isHigh || priority === "medium" || isRideLifecycle,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
}

/** Call once at app startup (before UI mounts). */
export async function initExpoNotifications(): Promise<void> {
  configureExpoNotificationHandler();
  await setupNotificationChannels();
}
