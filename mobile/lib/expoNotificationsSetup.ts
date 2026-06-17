import * as Notifications from "expo-notifications";

import { setupNotificationChannels } from "@/utils/notifications";

/**
 * Suppress OS notification banners while the app is in the foreground.
 * Foreground delivery is handled in-app via notificationManager (banner/alert).
 * Background/quit display uses firebaseMessagingBackground + the OS tray.
 */
export function configureExpoNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Call once at app startup (before UI mounts). */
export async function initExpoNotifications(): Promise<void> {
  configureExpoNotificationHandler();
  await setupNotificationChannels();
}
