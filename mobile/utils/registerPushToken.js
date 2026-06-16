import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import messaging from "@react-native-firebase/messaging";

import { setupNotificationChannels } from "@/utils/notifications";

/**
 * EAS project the Expo push token is minted against. This MUST match the project
 * baked into the native build (app.json `extra.eas.projectId`); a token minted
 * against the wrong project is silently undeliverable. Resolve it from the live
 * app config so it can never drift out of sync with the build, falling back to
 * the current project id for safety.
 */
const EXPO_PROJECT_ID =
  Constants?.expoConfig?.extra?.eas?.projectId ??
  Constants?.easConfig?.projectId ??
  "94e02c15-7ea1-43dd-9eaa-5f03e9b9a871";

function formatPushError(err) {
  if (err == null) return "null";
  if (typeof err !== "object") return String(err);
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch {
    return String(err);
  }
}

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log("Push notifications only work on physical devices");
    return null;
  }

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied");
    return null;
  }

  let token = null;
  let tokenSource = null;

  // Prefer the native FCM registration token from @react-native-firebase. It is
  // package-specific (correct for the current package name) and delivered
  // directly by the backend's Firebase Admin SDK — no Expo push service or EAS
  // push credentials required. This is the most reliable path after a package
  // rename, where Expo-proxied tokens silently break.
  try {
    if (Platform.OS === "ios") {
      // iOS must register for remote messages before a token is available.
      await messaging().registerDeviceForRemoteMessages?.();
    }
    token = (await messaging().getToken()) || null;
    if (token) tokenSource = "native-fcm";
  } catch (err) {
    console.warn(
      "Native FCM token failed, falling back to Expo:",
      formatPushError(err),
    );
  }

  // Fallback: Expo push token (delivered via the Expo Push API).
  if (!token) {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
      token = expoToken?.data ?? null;
      if (token) tokenSource = "expo-push";
    } catch (err) {
      console.warn("Expo push token failed:", formatPushError(err));
    }
  }

  // Last resort: expo-notifications native device token.
  if (!token) {
    try {
      const native = await Notifications.getDevicePushTokenAsync();
      token = native?.data ?? null;
      if (token) tokenSource = "expo-device";
    } catch (err) {
      console.warn("Native device push token failed:", formatPushError(err));
    }
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }

  if (token) {
    console.log(
      `[push] token source=${tokenSource} platform=${Platform.OS} value=${token.slice(0, 24)}…`,
    );
  } else {
    console.warn("[push] no push token obtained (simulator or permissions denied)");
  }
  return token;
}
