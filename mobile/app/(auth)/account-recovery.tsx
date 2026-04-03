import {
  ActivityIndicator,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useState } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { useRouter } from "expo-router";

import { WINDOW_WIDTH } from "@/constants/Metrics";
import apiClient from "@/utils/apiClient";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";

/**
 * Account recovery: login via email when user can't access their phone.
 * Requires user to have added email in profile (complete profile or account settings).
 */
const AccountRecovery = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    const trimmed = email.trim();
    const emailError = validators.emailRequired("Please enter a valid email")(trimmed);
    if (emailError) {
      showMessage({ type: "warning", message: emailError });
      return;
    }
    setLoading(true);
      apiClient
        .post("auth/user/request-login-otp", { email_phone_number: trimmed })
        .then(({ data }) => {
          showMessage({ type: "success", message: data.message });
          router.push({
            pathname: "/otpcode",
            params: {
              email_phone_number: trimmed,
              target: "LOGIN",
              title: "Enter code",
              text: "We sent a login code to your email",
            },
          });
        })
        .catch((err) => {
          if (err?.response?.data?.message) {
            showMessage({
              type: "danger",
              message: err.response.data.message,
            });
          } else {
            showMessage({
              type: "danger",
              message: "Could not send code. Make sure this email is on your account (add it in Profile > Edit if needed).",
            });
          }
        })
        .finally(() => setLoading(false));
  };

  return (
    <ImageBackground
      source={require("@/assets/images/register-bg.png")}
      style={tw.style(`flex-1 flex-col justify-between py-[54px] px-6`, {
        width: WINDOW_WIDTH,
      })}
    >
      <View>
        <StatusBar barStyle="dark-content" />

        <TouchableOpacity onPress={() => router.back()}>
          <Svg width="39" height="39" viewBox="0 0 39 39" fill="none">
            <Circle cx="19.5" cy="19.5" r="19" stroke="black" />
            <Path
              d="M29 19H9"
              stroke="black"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M19 29L9 19L19 9"
              stroke="black"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>

        <View style={tw`flex-col gap-y-4 items-center my-11`}>
          <Text
            style={tw.style(`text-2xl text-[#2A2A2A] text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Account Recovery
          </Text>
          <Text
            style={tw.style(`text-base text-[#A0A0A0] text-center px-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Enter the email you added to your account. We'll send you a login code.
          </Text>

          <View style={tw`w-full`}>
            <FormInput
              value={email}
              onChangeText={setEmail}
              placeholder="Your email"
              type="email-address"
              validate={validators.emailRequired("Please enter a valid email")}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!email.trim()}
        style={tw.style(
          `bg-base-green py-4 rounded-[8px]`,
          !email.trim() && "opacity-60"
        )}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text
            style={tw.style(`text-white text-base text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Send login code
          </Text>
        )}
      </TouchableOpacity>
    </ImageBackground>
  );
};

export default AccountRecovery;
