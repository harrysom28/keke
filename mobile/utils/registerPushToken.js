import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";

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
  try {
    const expoToken = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    token = expoToken?.data ?? null;
  } catch (err) {
    console.warn("Expo push token failed, trying native device token:", err?.message);
  }

  if (!token) {
    try {
      const native = await Notifications.getDevicePushTokenAsync();
      token = native?.data ?? null;
    } catch (err) {
      console.warn("Native push token failed:", err?.message);
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
    console.log("Push token registered locally:", token.slice(0, 24) + "…");
  }
  return token;
}
