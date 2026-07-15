import * as Notifications from "expo-notifications";
import { AppState, PermissionsAndroid, Platform } from "react-native";
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

/** In-flight only — do not cache a failed result or retries never run. */
let notificationPromptInFlight: Promise<boolean> | null = null;

export function resetNotificationPermissionSession(): void {
  notificationPromptInFlight = null;
}

export function notificationPermissionIsGranted(
  perm: Notifications.NotificationPermissionsStatus
): boolean {
  return perm.granted === true || perm.status === "granted";
}

/** Expo and Android native permission can disagree on API 33+ — trust either source. */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  if (notificationPermissionIsGranted(perm)) {
    return true;
  }
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    } catch {
      return false;
    }
  }
  return false;
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

/**
 * Whether we should show the OS notification dialog now.
 * Some Android OEMs report canAskAgain:false before the user was ever asked.
 */
export async function shouldRequestNotificationPermission(): Promise<boolean> {
  if (await isNotificationPermissionGranted()) {
    return false;
  }
  const perm = await Notifications.getPermissionsAsync();
  if (notificationPermissionCanRequest(perm)) {
    return true;
  }
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return !granted;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Prompt for notification permission (if needed) and register the device token.
 * Skips while the post-signup location disclosure is showing.
 */
export async function tryPromptAndRegisterNotifications(
  register: () => Promise<void>
): Promise<void> {
  const { isLocationDisclosurePending, shouldAutoShowLocationDisclosure } =
    await import("@/utils/locationDisclosure");
  if (
    (await isLocationDisclosurePending()) ||
    (await shouldAutoShowLocationDisclosure())
  ) {
    return;
  }
  if (AppState.currentState !== "active") {
    return;
  }

  if (await isNotificationPermissionGranted()) {
    await register();
    return;
  }

  if (!(await shouldRequestNotificationPermission())) {
    return;
  }

  const granted = await promptForPushNotificationsOnce();
  if (!granted || !(await isNotificationPermissionGranted())) {
    return;
  }

  await register();
}

async function requestNativeNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      const alreadyGranted = await PermissionsAndroid.check(permission);
      if (alreadyGranted) {
        return true;
      }

      const result = await PermissionsAndroid.request(permission, {
        title: "Enable notifications",
        message:
          "Keke Ride uses notifications for ride requests, driver updates, and trip alerts.",
        buttonPositive: "Allow",
        buttonNegative: "Not now",
      });

      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.warn("Android POST_NOTIFICATIONS request failed:", error);
    }
  }

  const result = await Notifications.requestPermissionsAsync();
  return notificationPermissionIsGranted(result);
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
    if (!(await isNotificationPermissionGranted())) {
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
  if (notificationPromptInFlight) {
    return notificationPromptInFlight;
  }

  notificationPromptInFlight = (async () => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (notificationPermissionIsGranted(existing)) {
        return true;
      }
      if (!(await shouldRequestNotificationPermission())) {
        return false;
      }

      const result = await requestNativeNotificationPermission();
      if (!result) {
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
    } finally {
      notificationPromptInFlight = null;
    }
  })();

  return notificationPromptInFlight;
}

/** @deprecated Use getPushTokenIfGranted — login must not prompt; _layout handles one post-sign-in ask. */
export async function requestUserNotificationPermission(): Promise<string> {
  return getPushTokenIfGranted();
}
