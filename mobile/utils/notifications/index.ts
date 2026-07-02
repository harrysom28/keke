import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
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

/** Serialize concurrent prompt attempts within one signed-in session. */
let notificationPromptPromise: Promise<boolean> | null = null;

export function resetNotificationPermissionSession(): void {
  notificationPromptPromise = null;
}

export function notificationPermissionIsGranted(
  perm: Notifications.NotificationPermissionsStatus
): boolean {
  return perm.granted === true || perm.status === "granted";
}

/**
 * Android 13+ often reports status "denied" before the user has ever been asked
 * (notifications not enabled yet). Only skip when canAskAgain is explicitly false.
 */
export function notificationPermissionCanRequest(
  perm: Notifications.NotificationPermissionsStatus
): boolean {
  if (notificationPermissionIsGranted(perm)) {
    return false;
  }
  if (perm.status === "undetermined") {
    return true;
  }
  return perm.canAskAgain !== false;
}

async function fetchPushTokenWhenGranted(): Promise<string> {
  try {
    const expoToken = await Notifications.getExpoPushTokenAsync();
    return expoToken?.data ?? "";
  } catch {
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      return deviceToken?.data ?? "";
    } catch (fallbackError) {
      console.warn(
        "Push token fetch failed, continuing without token:",
        fallbackError
      );
      return "";
    }
  }
}

/**
 * Read push token only when permission is already granted — never shows the OS dialog.
 * Use during login/signup; the post-sign-in bootstrap handles the one-time prompt.
 */
export async function getPushTokenIfGranted(): Promise<string> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (!notificationPermissionIsGranted(existing)) {
      return "";
    }
    return fetchPushTokenWhenGranted();
  } catch (permError) {
    console.warn(
      "Push permission check failed, continuing without token:",
      permError
    );
    return "";
  }
}

/**
 * Show the OS notification permission dialog when we are allowed to ask.
 * Returns true if notifications are allowed after the attempt.
 */
export async function promptForPushNotificationsOnce(): Promise<boolean> {
  if (notificationPromptPromise) {
    return notificationPromptPromise;
  }

  notificationPromptPromise = (async () => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (notificationPermissionIsGranted(existing)) {
        return true;
      }
      if (!notificationPermissionCanRequest(existing)) {
        return false;
      }

      const result = await Notifications.requestPermissionsAsync();
      if (!notificationPermissionIsGranted(result)) {
        return false;
      }

      if (Platform.OS === "ios") {
        try {
          const authStatus = await messaging().requestPermission();
          return (
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL
          );
        } catch {
          return true;
        }
      }

      return true;
    } catch (permError) {
      console.warn("Push permission request failed:", permError);
      return false;
    }
  })();

  return notificationPromptPromise;
}

/** @deprecated Use getPushTokenIfGranted — login must not prompt; _layout handles one post-sign-in ask. */
export async function requestUserNotificationPermission(): Promise<string> {
  return getPushTokenIfGranted();
}
