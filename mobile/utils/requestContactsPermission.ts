import { PermissionsAndroid, Platform } from "react-native";

/**
 * Request READ_CONTACTS on Android with a custom rationale dialog.
 * On iOS, returns true (expo-contacts will prompt via requestPermissionsAsync).
 */
export const requestContactsPermission = async (): Promise<boolean> => {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: "Contacts Permission",
        message:
          "We need access to your contacts to help you share rides with friends.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("Contacts permission request failed:", err);
    return false;
  }
};
