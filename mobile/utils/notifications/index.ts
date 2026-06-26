import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Alert } from "react-native";
import messaging from "@react-native-firebase/messaging";

/**
 * TASK 3: Create Android notification channels - rides (HIGH), payments, general.
 */
export const setupNotificationChannels = async () => {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("rides", {
      name: "Ride Updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300],
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("payments", {
      name: "Payments",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("general", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  } catch (e) {
    console.warn("Could not create notification channels:", e);
  }
};

/**
 * Prefer Expo Push Token so the backend can use Expo Push API (no FCM key required).
 * Falls back to native device token if getExpoPushTokenAsync is not available (e.g. missing projectId).
 */
export const requestUserNotificationPermission = async (): Promise<string> => {
  let token = "";
  let status: Notifications.PermissionStatus = "undetermined";
  try {
    const result = await Notifications.requestPermissionsAsync();
    status = result.status;
  } catch (permError) {
    console.warn(
      "Push permission request failed, continuing without token:",
      permError
    );
    return token;
  }
  let enabled = false;
  try {
    const authStatus = await messaging().requestPermission();
    enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  } catch (_) {
    enabled = status === "granted";
  }

  if (status !== "granted") {
    Alert.alert("Permission not granted for notifications");
  }
  if (!enabled) return token;

  try {
    // Prefer Expo push token (ExponentPushToken[...]) so backend can use Expo Push API
    const expoToken = await Notifications.getExpoPushTokenAsync();
    token = expoToken?.data ?? "";
  } catch (_) {
    try {
      // Fallback: native FCM/APNs token (backend will use FCM if FCM_SERVER_KEY is set)
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      token = deviceToken?.data ?? "";
    } catch (fallbackError) {
      // Both Expo and native token fetch failed (e.g. FIS_AUTH_ERROR
      // from an unregistered signing cert). Never let this block a
      // caller's auth flow — return empty and move on.
      console.warn(
        "Push token fetch failed, continuing without token:",
        fallbackError
      );
      token = "";
    }
  }

  return token;
};
