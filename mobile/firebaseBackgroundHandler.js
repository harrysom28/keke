/**
 * Registers React Native Firebase background message handling before any React tree runs.
 * Must not import from expo-router or other app entry dependencies.
 * @see https://rnfirebase.io/messaging/usage#background--quit-state-messages
 */
import * as Notifications from "expo-notifications";
import messaging from "@react-native-firebase/messaging";

try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log("Background message received:", remoteMessage);

    const title = remoteMessage?.notification?.title;
    const body = remoteMessage?.notification?.body;
    const rawData = remoteMessage?.data;

    // Optional: mirror prior useNotification behavior — show via Expo when a display payload exists.
    // FCM "notification" messages may already show in the system tray; this keeps in-app parity when needed.
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
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: title != null ? String(title) : "",
            body: body != null ? String(body) : "",
            data,
          },
          trigger: null,
        });
      } catch (e) {
        console.warn("Background FCM: scheduleNotificationAsync failed", e);
      }
    }
  });
} catch (e) {
  console.warn("Background FCM: messaging not available", e);
}
