import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CONFIRM_OTP,
  FORGOT_PASSWORD_CONFIRM_OTP,
  RESEND_OTP,
} from "@/constants";
import React, { useState } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import {
  WINDOW_WIDTH,
  horizontalScale,
  verticalScale,
} from "@/constants/Metrics";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthState } from "@/store/AuthSlice";
import { OtpInput } from "react-native-otp-entry";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";

type ITarget = "SIGNUP" | "FORGOT-PASSWORD";

export const OTP_TARGET: Array<ITarget> = ["SIGNUP", "FORGOT-PASSWORD"];

const OtpCode = () => {
  const router = useRouter();
  const item = useLocalSearchParams();
  const { registration } = useSelector(AuthState);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState(false);

  const handleConfirm = (text: string = otp) => {
    switch (item?.target) {
      case OTP_TARGET[0]:
        return validateSignupPin(text);
      case OTP_TARGET[1]:
        return validateForgotPasswordPin(text);
    }
  };

  const validateForgotPasswordPin = (text: string) => {
    setLoading(true);
    axios
      .post(FORGOT_PASSWORD_CONFIRM_OTP, { otp: text })
      .then(({ data }) => {
        console.log(data);
        showMessage({
          type: "success",
          message: data.message,
        });

        router.push({
          pathname: `/setpassword`,
          params: { otp: text },
        });
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  const validateSignupPin = (text: string) => {
    setLoading(true);
    axios
      .post(CONFIRM_OTP, { otp: text, email_phone_number: item?.email_phone_number })
      .then(({ data }) => {
        console.log(data);
        showMessage({
          type: "success",
          message: data.message,
        });

        router.push({
          pathname: `/authenticate`,
          params: { otp: text, email_phone_number: item?.email_phone_number },
        });
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  const resendOtp = () => {
    setResend(true);

    // Determine role based on registration type: "1" = passenger, "2" = driver
    const role = registration?.type === "2" ? "driver" : "passenger";

    axios
      .post(RESEND_OTP, { 
        email_phone_number: item?.email_phone_number,
        role: role, // Include role for user creation if needed
      })
      .then(({ data }) => {
        console.log("Resend OTP success:", data);
        showMessage({ 
          message: data?.message || "OTP sent successfully", 
          type: "success" 
        });
        setOtp("");
      })
      .catch((err) => {
        console.log("Resend OTP error:", err?.response?.data || err.message, err?.response?.status || "Network Error");
        
        // Handle specific error cases
        if (err?.response?.status === 404) {
          showMessage({
            type: "warning",
            message: "User not found. Please complete registration first.",
          });
        } else if (err?.response?.status === 409) {
          // Account already exists
          showMessage({
            type: "info",
            message: err?.response?.data?.message || "Account already exists. Please login instead.",
          });
        } else if (err?.response?.data?.error) {
          const e = err.response.data.error;
          showMessage({ 
            message: typeof e === "string" ? e : (e?.message || "Request failed"), 
            type: "danger" 
          });
        } else if (err?.response?.data?.message) {
          showMessage({
            message: err.response.data.message,
            type: "danger",
          });
        } else if (err?.response?.status) {
          showMessage({
            type: "danger",
            message: `Server error: ${err.response.status}`,
          });
        } else {
          showMessage({
            type: "danger",
            message: "Network error: Unable to reach server. Please check your connection.",
          });
        }
      })
      .finally(() => setResend(false));
  };

  return (
    <ImageBackground
      source={require("@/assets/images/register-bg.png")}
      style={tw.style(
        `flex-1 flex-col justify-between py-[54px] px-6 text-white`,
        {
          width: WINDOW_WIDTH,
        }
      )}
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
            {item?.title}
          </Text>
          <Text
            style={tw.style(`text-lg text-[#A0A0A0] text-center mx-8`, {
              fontFamily: "RobotoBold",
            })}
          >
            {item?.text}
          </Text>
          <OtpInput
            numberOfDigits={6}
            theme={{
              containerStyle: tw`flex-row justify-center gap-x-2`,
              pinCodeContainerStyle: tw.style(
                `my-4 border-[#D0D0D0] rounded-[7px]`,
                { width: horizontalScale(45), height: verticalScale(44) }
              ),
              pinCodeTextStyle: tw.style(`text-2xl`, {
                fontFamily: "RobotoBold",
              }),
              filledPinCodeContainerStyle: tw`bg-[#3C8F7C69] border-base-green`,
              focusedPinCodeContainerStyle: tw`border-2 border-base-green`,
            }}
            blurOnFilled
            hideStick
            onTextChange={(text) => setOtp(text)}
            onFilled={(text) => handleConfirm(text)}
          />

          <View style={tw`flex-row items-center`}>
            <Text
              style={tw.style(`text-base text-[#5A5A5A] `, {
                fontFamily: "RobotoMedium",
              })}
            >
              Didn't receive code?{" "}
            </Text>
            <TouchableOpacity onPress={resendOtp}>
              {resend ? (
                <ActivityIndicator color={tw.color("base-green")} />
              ) : (
                <Text
                  style={tw.style(`text-base text-base-green `, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Resend again
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => handleConfirm()}
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
            Verify
          </Text>
        )}
      </TouchableOpacity>
    </ImageBackground>
  );
};

export default OtpCode;
