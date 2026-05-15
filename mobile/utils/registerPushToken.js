import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { setupNotificationChannels } from "@/utils/notifications";

const EXPO_PROJECT_ID = "30082c2b-41a8-455d-86d3-984b6d259cd6";

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
