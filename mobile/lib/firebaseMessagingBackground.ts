/**
 * Register FCM background handler as early as possible (bundle load).
 * RNFirebase expects this outside React; registering only inside useEffect can miss
 * background data messages on Android.
 *
 * Ride pushes use Expo Push API + expo-notifications; this mainly satisfies native
 * Firebase Messaging lifecycle when @react-native-firebase/messaging is linked.
 */
import messaging from "@react-native-firebase/messaging";

try {
  messaging().setBackgroundMessageHandler(async () => {
    // Expo-delivered ride alerts use expo-notifications listeners instead.
  });
} catch {
  // Firebase not configured on this build — ignore.
}
