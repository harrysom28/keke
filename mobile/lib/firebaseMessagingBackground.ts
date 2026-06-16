/**
 * Register FCM background handler at bundle load (before React).
 * @see https://rnfirebase.io/messaging/usage#background--quit-state-messages
 *
 * Android ride-offer pushes are sent DATA-ONLY with priority:high (see backend
 * sendFcmViaFirebaseAdmin). Data-only guarantees this handler runs in the
 * background/quit state and makes it the SOLE display path (no duplicate from an
 * OS auto-display, and no reliance on the OS owning the FCM service while
 * expo-notifications is also installed). title/body/channel travel in `data`.
 */
import * as Notifications from "expo-notifications";
import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";

import { configureExpoNotificationHandler } from "@/lib/expoNotificationsSetup";
import { setupNotificationChannels } from "@/utils/notifications";

configureExpoNotificationHandler();

const pickChannelId = (priority: string, type?: string): string => {
  if (priority === "high" || priority === "critical") return "rides";
  if (type === "payment") return "payments";
  return "general";
};

const pickAndroidPriority = (
  priority: string
): Notifications.AndroidNotificationPriority => {
  if (priority === "high" || priority === "critical") {
    return Notifications.AndroidNotificationPriority.HIGH;
  }
  return Notifications.AndroidNotificationPriority.DEFAULT;
};

try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    try {
      console.log("Background FCM message:", remoteMessage?.messageId);

      const rawData =
        remoteMessage?.data &&
        typeof remoteMessage.data === "object" &&
        !Array.isArray(remoteMessage.data)
          ? (remoteMessage.data as Record<string, unknown>)
          : {};

      const data = Object.fromEntries(
        Object.entries(rawData).map(([k, v]) => [k, String(v ?? "")])
      );

      // Data-only payloads carry title/body in `data`; fall back to the
      // notification block for any mixed/legacy payloads.
      const title = String(
        remoteMessage?.notification?.title ?? data.title ?? ""
      ).trim();
      const body = String(
        remoteMessage?.notification?.body ?? data.body ?? data.message ?? ""
      ).trim();

      if (!title && !body) {
        return;
      }

      // The React app has NOT mounted in the quit/background state, so its
      // startup channel setup never ran. Channels must exist before a local
      // notification can be displayed or Android drops it silently.
      await setupNotificationChannels();

      const priority = String(data.priority || "medium");
      // Backend embeds channelId in data (see sendFcmViaFirebaseAdmin); honour it.
      const channelId =
        String(data.channelId || "").trim() ||
        pickChannelId(priority, data.type);

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: "default",
          ...(Platform.OS === "android"
            ? {
                channelId,
                priority: pickAndroidPriority(priority),
              }
            : {}),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn("Background FCM: failed to display notification", e);
    }
  });
} catch {
  // Firebase not configured on this build.
}
