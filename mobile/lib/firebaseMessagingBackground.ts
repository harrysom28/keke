/**
 * Register FCM background handler at bundle load (before React).
 * @see https://rnfirebase.io/messaging/usage#background--quit-state-messages
 */
import * as Notifications from "expo-notifications";
import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";

import { configureExpoNotificationHandler } from "@/lib/expoNotificationsSetup";

configureExpoNotificationHandler();

try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log("Background FCM message:", remoteMessage?.messageId);

    const title = remoteMessage?.notification?.title;
    const body = remoteMessage?.notification?.body;
    const rawData = remoteMessage?.data;
    const priority = String(rawData?.priority || "medium");

    if (
      (title != null && String(title).trim() !== "") ||
      (body != null && String(body).trim() !== "")
    ) {
      const data =
        rawData && typeof rawData === "object" && !Array.isArray(rawData)
          ? Object.fromEntries(
              Object.entries(rawData).map(([k, v]) => [k, String(v ?? "")])
            )
          : {};

      const channelId =
        priority === "high" || priority === "critical"
          ? "rides"
          : rawData?.type === "payment"
            ? "payments"
            : "general";

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: title != null ? String(title) : "",
            body: body != null ? String(body) : "",
            data,
            ...(Platform.OS === "android" ? { channelId } : {}),
          },
          trigger: null,
        });
      } catch (e) {
        console.warn("Background FCM: scheduleNotificationAsync failed", e);
      }
    }
  });
} catch {
  // Firebase not configured on this build.
}
