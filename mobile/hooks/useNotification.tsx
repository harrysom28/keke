import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, Vibration } from "react-native";

import { TRemoteNotification } from "@/types";
import { setupNotificationChannels } from "@/utils/notifications";
import messaging from "@react-native-firebase/messaging";
import { useNavigation } from "expo-router";

// interface IState {
//   title: string;
//   body: string;
//   data: { [key: string]: string }; // optional data payload
// }

export default function useNotification() {
  const [notificationEvent, setNotificationEvent] =
    useState<TRemoteNotification>({
      title: "",
      body: "",
      data: {} as TRemoteNotification["data"], // optional data payload
    });
  const navigation = useNavigation();

  useEffect(() => {
    // TASK 3: Create Android notification channels
    setupNotificationChannels();

    // TASK 9: Priority handling - HIGH: alert + sound + vibrate
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data || {};
        const priority = data.priority || "medium";
        const isHigh = priority === "high";
        if (isHigh && Platform.OS === "android") {
          Vibration.vibrate(300);
        }
        return {
          shouldShowAlert: isHigh || priority === "medium",
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      },
    });

    // TASK 8: Deep link - extract data.screen and rideId, navigate with params
    const handleNotificationClick = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      const screen = data.screen;
      const rideId = data.rideId;
      if (screen) {
        if (rideId) {
          navigation.navigate(screen as never, { rideId } as never);
        } else {
          navigation.navigate(screen as never);
        }
      }
    };

    // Listen for user clicking on a notification (Expo local)
    const notificationClickSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationClick
      );

    let messagingUnsubscribe: (() => void) | null = null;
    try {
      // Handle user opening the app from a notification (when the app is in the background)
      messaging().onNotificationOpenedApp((remoteMessage) => {
        const d = remoteMessage?.data || {};
        const screen = d.screen;
        const rideId = d.rideId;
        if (screen) {
          if (rideId) {
            navigation.navigate(screen as never, { rideId } as never);
          } else {
            navigation.navigate(screen as never);
          }
        }
      });

    // Check if the app was opened from a notification (when the app was completely quit)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          const d = remoteMessage?.data || {};
          const screen = d.screen;
          const rideId = d.rideId;
          if (screen) {
            if (rideId) {
              navigation.navigate(screen as never, { rideId } as never);
            } else {
              navigation.navigate(screen as never);
            }
          }
        }
      });

    // Background/killed: setBackgroundMessageHandler is registered in index.js (firebaseBackgroundHandler.js).

    const handlePushNotification = async (remoteMessage) => {
      const data = remoteMessage?.data || {};
      const notification = {
        title: remoteMessage?.notification?.title as string,
        body: remoteMessage?.notification?.body as string,
        data,
      };
      setNotificationEvent(notification as TRemoteNotification);

      // TASK 9: HIGH priority - vibrate on foreground receipt
      const priority = data.priority || "medium";
      if (priority === "high" && Platform.OS === "android") {
        Vibration.vibrate(300);
      }

      // Schedule the notification with a null trigger to show immediately
      await Notifications.scheduleNotificationAsync({
        content: notification,
        trigger: null,
      });

      setTimeout(() => {
        setNotificationEvent({
          title: "",
          body: "",
          data: {} as TRemoteNotification["data"], // optional data payload
        });
      }, 10000);
    };

    // Listen for push notifications when the app is in the foreground
      messagingUnsubscribe = messaging().onMessage(handlePushNotification);
    } catch (_) {
      // Firebase not configured (placeholder GoogleService-Info.plist) - push won't work
    }

    // Clean up the event listeners
    return () => {
      messagingUnsubscribe?.();
      notificationClickSubscription.remove();
    };
  }, []);

  return { notificationEvent };
}
