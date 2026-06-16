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

  // Prefer the Expo push token (delivered via the Expo Push API). The backend
  // sends these with a simple POST to exp.host — no Firebase Admin service
  // account is required on the server; the FCM credential lives in EAS and Expo
  // relays to FCM/APNs under the hood. google-services.json already registers
  // this package (com.kekeride.app) under Firebase project keke-1ea45.
  try {
    const expoToken = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    token = expoToken?.data ?? null;
    if (token) tokenSource = "expo-push";
  } catch (err) {
    console.warn("Expo push token failed, falling back to native FCM:", err?.message);
  }

  // Fallback: native FCM registration token from @react-native-firebase,
  // delivered by the backend's Firebase Admin SDK (requires server credentials).
  if (!token) {
    try {
      if (Platform.OS === "ios") {
        // iOS must register for remote messages before a token is available.
        await messaging().registerDeviceForRemoteMessages?.();
      }
      token = (await messaging().getToken()) || null;
      if (token) tokenSource = "native-fcm";
    } catch (err) {
      console.warn("Native FCM token failed:", err?.message);
    }
  }

  // Last resort: expo-notifications native device token.
  if (!token) {
    try {
      const native = await Notifications.getDevicePushTokenAsync();
      token = native?.data ?? null;
      if (token) tokenSource = "expo-device";
    } catch (err) {
      console.warn("Native device push token failed:", err?.message);
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
