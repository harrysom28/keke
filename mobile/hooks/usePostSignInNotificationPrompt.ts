import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSelector } from "react-redux";

import { AuthState } from "@/store/AuthSlice";
import notificationManager from "@/services/notificationManager";
import {
  notificationPermissionCanRequest,
  notificationPermissionIsGranted,
  promptForPushNotificationsOnce,
} from "@/utils/notifications";
import * as Notifications from "expo-notifications";

/**
 * Ask for notification permission once per sign-in, when a main map/home screen is
 * focused and the Activity is in the foreground. Root _layout is too early on Android.
 */
export function usePostSignInNotificationPrompt(screenFocused: boolean): void {
  const { token } = useSelector(AuthState);
  const attemptedForTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!screenFocused || !token) {
      return;
    }
    if (attemptedForTokenRef.current === token) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (cancelled || AppState.currentState !== "active") {
          return;
        }

        try {
          const perm = await Notifications.getPermissionsAsync();
          if (cancelled) {
            return;
          }

          if (notificationPermissionIsGranted(perm)) {
            attemptedForTokenRef.current = token;
            await notificationManager.registerFcmToken();
            return;
          }

          if (!notificationPermissionCanRequest(perm)) {
            attemptedForTokenRef.current = token;
            return;
          }

          const granted = await promptForPushNotificationsOnce();
          attemptedForTokenRef.current = token;

          if (!cancelled && granted) {
            await notificationManager.registerFcmToken();
          }
        } catch (error) {
          if (__DEV__) {
            console.warn("Notification permission bootstrap failed:", error);
          }
        }
      })();
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screenFocused, token]);
}
