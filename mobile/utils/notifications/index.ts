import * as Notifications from "expo-notifications";

import { Alert } from "react-native";
import messaging from "@react-native-firebase/messaging";

export const requestUserNotificationPermission = async (): Promise<string> => {
  let token = "";
  const { status } = await Notifications.requestPermissionsAsync();
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (status !== "granted") {
    Alert.alert("Permission not granted for notifications");
  }
  if (enabled) {
    // console.log("Authorization status:", authStatus);
    token = (await Notifications.getDevicePushTokenAsync()).data;
  }

  return token;
};
