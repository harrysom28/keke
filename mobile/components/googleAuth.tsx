import { ActivityIndicator, TouchableOpacity } from "react-native";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { googleSignOut, signInWithGoogle } from "../utils/googleAuth";

import { GOOGLE_AUTH } from "../constants";
import axios from "axios";
import { getUniqueId } from "react-native-device-info";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { router } from "expo-router";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { updateToken } from "@/store/AuthSlice";
import { useDispatch } from "react-redux";
import { useState } from "react";

const GoogleAuthButton = () => {
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  const AuthenticateWithGoogle = async () => {
    const accessToken = await signInWithGoogle();
    if (accessToken) {
      setLoading(true);
      const device_id = await getUniqueId();

      // Push token is best-effort. Google auth must succeed even if this fails.
      let device_token = "";
      try {
        device_token = await requestUserNotificationPermission();
      } catch (tokenError) {
        console.warn(
          "Push token unavailable, continuing Google auth without it:",
          tokenError
        );
      }

      axios
        .post(GOOGLE_AUTH, {
          access_token: accessToken,
          device_id,
          device_token,
        })
        .then(({ data }) => {
          console.log(data);
          dispatch(updateToken(data?.authorisation?.token));

          if (data?.message === "register") {
            router.navigate({
              pathname: "/authenticate-google",
              params: {
                name: data?.profile?.name,
                email: data?.profile?.email,
              },
            });
          } else if (data?.message === "login") {
            router.navigate("/");
          }
        })
        .catch((err) => {
          console.log("Google auth error:", err?.response?.data || err.message, err?.response?.status || "Network Error");
          
          if (err?.response?.data?.error) {
            // Handle error object - extract message string
            const errorData = err.response.data.error;
            const errorMessage = typeof errorData === 'string' 
              ? errorData 
              : (errorData?.message || errorData?.name || 'Authentication failed');
            showMessage({
              message: errorMessage,
              type: "danger",
            });
          } else if (err?.response?.data?.message) {
            showMessage({
              message: err.response.data.message,
              type: "danger",
            });
          } else {
            showErrorMessage(err);
          }
        })
        .finally(() => setLoading(false));
    } else {
      console.log("Google Sign-In was canceled or failed.");
    }
    googleSignOut();
  };

  return (
    <TouchableOpacity
      onPress={AuthenticateWithGoogle}
      style={tw`h-[48px] w-[48px] flex-row justify-center items-center border border-[#D0D0D0] rounded-[8px]`}
    >
      {loading ? (
        <ActivityIndicator color={tw.color("base-green")} />
      ) : (
        <Svg width="19" height="20" viewBox="0 0 19 20" fill="none">
          <G clip-path="url(#clip0_936_5789)">
            <Path
              d="M18.5851 10.2106C18.5851 9.43171 18.5232 8.86334 18.3894 8.27393H9.68359V11.7894H14.7937C14.6907 12.663 14.1343 13.9787 12.898 14.8628L12.8807 14.9805L15.6333 17.159L15.824 17.1784C17.5754 15.5259 18.5851 13.0945 18.5851 10.2106Z"
              fill="#4285F4"
            />
            <Path
              d="M9.68376 19.4729C12.1873 19.4729 14.289 18.6308 15.8241 17.1783L12.8982 14.8627C12.1152 15.4205 11.0643 15.81 9.68376 15.81C7.23174 15.81 5.15062 14.1575 4.40875 11.8735L4.30001 11.883L1.43782 14.1459L1.40039 14.2522C2.92517 17.3467 6.05719 19.4729 9.68376 19.4729Z"
              fill="#34A853"
            />
            <Path
              d="M4.40951 11.8736C4.21376 11.2842 4.10047 10.6526 4.10047 10C4.10047 9.34742 4.21376 8.71592 4.39921 8.12651L4.39402 8.00098L1.49596 5.70166L1.40114 5.74774C0.772707 7.03185 0.412109 8.47386 0.412109 10C0.412109 11.5262 0.772707 12.9682 1.40114 14.2523L4.40951 11.8736Z"
              fill="#FBBC05"
            />
            <Path
              d="M9.68376 4.19016C11.4249 4.19016 12.5994 4.95851 13.2691 5.6006L15.8859 2.99029C14.2788 1.46411 12.1873 0.527344 9.68376 0.527344C6.05719 0.527344 2.92517 2.65346 1.40039 5.7479L4.39846 8.12667C5.15062 5.84267 7.23174 4.19016 9.68376 4.19016Z"
              fill="#EB4335"
            />
          </G>
          <Defs>
            <ClipPath id="clip0_936_5789">
              <Rect
                x="0.412109"
                y="0.5"
                width="18.1739"
                height="19"
                rx="9.08696"
                fill="white"
              />
            </ClipPath>
          </Defs>
        </Svg>
      )}
    </TouchableOpacity>
  );
};

export default GoogleAuthButton;
