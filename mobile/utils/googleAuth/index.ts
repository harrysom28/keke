import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { showMessage } from "react-native-flash-message";

export const googleSignOut = async () => {
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.error("Error during Google sign-out:", error);
    showMessage({
      type: "danger",
      message: "Failed to sign out. Please try again.",
    });
  }
};

export const signInWithGoogle = async (): Promise<string | null> => {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (isSuccessResponse(response)) {
      const { accessToken } = await GoogleSignin.getTokens();
      return accessToken;
    }
    return null;
  } catch (error: any) {
    if (
      error.code === statusCodes.SIGN_IN_CANCELLED ||
      error.code === statusCodes.IN_PROGRESS
    ) {
      return null;
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      showMessage({
        type: "warning",
        message: "Google Play Services are not available on this device!",
      });
    } else {
      console.error("Google sign-in error:", error);
      showMessage({
        type: "danger",
        message: "Ooops! Something went wrong with Google authentication.",
      });
    }
    return null;
  }
};
