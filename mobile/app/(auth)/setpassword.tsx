import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useState } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import {
  WINDOW_WIDTH,
  horizontalScale,
  verticalScale,
} from "@/constants/Metrics";
import { useLocalSearchParams, useRouter } from "expo-router";

import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import { OtpInput } from "react-native-otp-entry";
import { RESET_PASSWORD } from "@/constants";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";

const SetPassword = () => {
  const router = useRouter();
  const { otp, reset_token } = useLocalSearchParams<{ otp?: string; reset_token?: string }>();
  const [state, setState] = useState({
    password: "",
    password_confirmation: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (state.password !== state.password_confirmation)
      return showMessage({
        type: "warning",
        message: "Passwords do not match",
      });

    setLoading(true);
    const payload = reset_token
      ? { reset_token, password: state.password, password_confirmation: state.password_confirmation }
      : { otp, password: state.password, password_confirmation: state.password_confirmation };
    axios
      .post(RESET_PASSWORD, payload)
      .then(({ data }) => {
        console.log(data);
        showMessage({
          type: "success",
          message: data.message,
        });

        router.navigate("/login");
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.message ??
          err?.response?.data?.error?.message ??
          (typeof err?.response?.data?.error === "string" ? err.response.data.error : null) ??
          err?.message ??
          "Could not reset password. Please try again.";
        showMessage({ type: "danger", message: msg });
      })
      .finally(() => setLoading(false));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ImageBackground
        source={require("@/assets/images/register-bg.png")}
        style={tw.style(`flex-1 flex-col text-white`, {
          width: WINDOW_WIDTH,
        })}
      >
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "space-between",
            paddingTop: 54,
            paddingBottom: 32,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
            Set New Password
          </Text>
          <Text
            style={tw.style(`text-lg text-[#A0A0A0] text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Set your new password, and kindly store carefully
          </Text>

          <View style={tw`self-start flex-col gap-y-4 w-full`}>
            <FormInput
              value={state.password}
              onChangeText={(password) =>
                setState((prev) => ({ ...prev, password }))
              }
              placeholder="Enter Your New Password"
              height={50}
              secureTextEntry
              passwordVisibleByDefault
              validate={validators.passwordRequired(6)}
            />
            <FormInput
              value={state.password_confirmation}
              onChangeText={(password_confirmation) =>
                setState((prev) => ({ ...prev, password_confirmation }))
              }
              placeholder="Confirm Password"
              height={50}
              secureTextEntry
              passwordVisibleByDefault
              validate={(v) => {
                if (!v?.trim()) return "Confirm your password";
                return v !== state.password ? "Passwords do not match" : undefined;
              }}
            />

            <Text
              style={tw.style(`text-sm text-[#A6A6A6]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Atleast 1 number and a special character
            </Text>
          </View>
        </View>
      </View>

          <TouchableOpacity
            onPress={handleSubmit}
            style={tw`bg-base-green py-4 rounded-[8px]`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-white text-base text-center`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
};

export default SetPassword;
