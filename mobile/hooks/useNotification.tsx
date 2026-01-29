import * as Notifications from "expo-notifications";

import { useEffect, useState } from "react";

import { TRemoteNotification } from "@/types";
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
    // Set up the notification handler for the app
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Handle user clicking on a notification and open the screen
    const handleNotificationClick = async (response) => {
      const screen = response?.notification?.request?.content?.data
        ?.screen as never;
      if (screen !== null) {
        navigation.navigate(screen);
      }
    };

    // Listen for user clicking on a notification
    const notificationClickSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationClick
      );

    // Handle user opening the app from a notification (when the app is in the background)
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log(
        "Notification caused app to open from background state:",
        remoteMessage.data.screen,
        navigation
      );
      if (remoteMessage?.data?.screen) {
        navigation.navigate(`${remoteMessage.data.screen}`);
      }
    });

    // Check if the app was opened from a notification (when the app was completely quit)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log(
            "Notification caused app to open from quit state:",
            remoteMessage.notification
          );
          if (remoteMessage?.data?.screen) {
            navigation.navigate(`${remoteMessage.data.screen}`);
          }
        }
      });

    // Handle push notifications when the app is in the background
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log("Message handled in the background!", remoteMessage);
      const notification = {
        title: remoteMessage.notification.title,
        body: remoteMessage.notification.body,
        data: remoteMessage.data, // optional data payload
      };

      // Schedule the notification with a null trigger to show immediately
      await Notifications.scheduleNotificationAsync({
        content: notification,
        trigger: null,
      });
    });

    const handlePushNotification = async (remoteMessage) => {
      const notification = {
        title: remoteMessage?.notification?.title as string,
        body: remoteMessage?.notification?.body as string,
        data: remoteMessage.data, // optional data payload
      };
      console.log(remoteMessage);
      setNotificationEvent(notification as TRemoteNotification);

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
    const unsubscribe = messaging().onMessage(handlePushNotification);

    // Clean up the event listeners
    return () => {
      unsubscribe();
      notificationClickSubscription.remove();
    };
  }, []);

  return { notificationEvent };
}
