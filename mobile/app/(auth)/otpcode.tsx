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
import React, { useEffect, useRef, useState } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import {
  WINDOW_WIDTH,
  horizontalScale,
  verticalScale,
} from "@/constants/Metrics";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthState, updateRegistration, updateToken, updateRefreshToken, updateUser } from "@/store/AuthSlice";
import { OtpInput } from "react-native-otp-entry";
import apiClient from "@/utils/apiClient";
import { getUniqueId } from "react-native-device-info";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { formatPhoneForDisplay } from "@/utils/phoneFormat";
import { useDispatch, useSelector } from "react-redux";

type ITarget = "SIGNUP" | "FORGOT-PASSWORD" | "LOGIN";

export const OTP_TARGET: Array<ITarget> = ["SIGNUP", "FORGOT-PASSWORD", "LOGIN"];

const OtpCode = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const item = useLocalSearchParams<{ email_phone_number?: string; target?: string }>();
  const { registration } = useSelector(AuthState);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState(false);
  const confirmLockRef = useRef(false);

  useEffect(() => {
    if (item?.email_phone_number) {
      dispatch(updateRegistration({ ...registration, email_phone_number: item.email_phone_number }));
    }
  }, [item?.email_phone_number]);

  const handleConfirm = (text: string = otp) => {
    switch (item?.target) {
      case OTP_TARGET[0]:
        return validateSignupPin(text);
      case OTP_TARGET[1]:
        return validateForgotPasswordPin(text);
      case OTP_TARGET[2]:
        return validateLoginOtp(text);
    }
  };

  const validateForgotPasswordPin = (text: string) => {
    if (loading || confirmLockRef.current) {
      return;
    }
    confirmLockRef.current = true;
    setLoading(true);
    apiClient
      .post("forgot/password/confirm-otp", {
        email_phone_number: item?.email_phone_number,
        otp: text,
      })
      .then(({ data }) => {
        console.log(data);
        showMessage({
          type: "success",
          message: data.message,
        });

        const resetToken = data?.data?.reset_token;
        router.push({
          pathname: `/setpassword`,
          params: resetToken ? { reset_token: resetToken } : { otp: text },
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
      .finally(() => {
        setLoading(false);
        confirmLockRef.current = false;
      });
  };

  const validateLoginOtp = async (text: string) => {
    if (loading || confirmLockRef.current) {
      return;
    }
    confirmLockRef.current = true;
    setLoading(true);
    let device_id = "mobile";
    let device_token: string | null = null;
    try {
      device_id = await getUniqueId().catch(() => "mobile");
      device_token = await requestUserNotificationPermission();
    } catch {
      setLoading(false);
      confirmLockRef.current = false;
      return;
    }
    apiClient
      .post("auth/user/login-with-otp", {
        email_phone_number: item?.email_phone_number,
        otp: text,
        device_id,
        device_token,
      })
      .then(({ data }) => {
        showMessage({ type: "success", message: data.message });
        dispatch(updateToken(data?.authorisation?.token));
        dispatch(updateRefreshToken(data?.authorisation?.refresh_token || null));
        if (data?.data?.user) {
          dispatch(updateUser({ profile: data.data.user }));
        }
        if (data?.data?.needs_onboarding) {
          const role = data?.data?.user?.role;
          if (role === "driver") {
            router.replace("/driverinfo");
          } else {
            router.replace({ pathname: "/authenticate", params: { fromLogin: "1" } });
          }
        } else {
          router.replace("/");
        }
      })
      .catch((err) => {
        if (err?.response?.data?.message) {
          showMessage({ type: "danger", message: err.response.data.message });
        } else {
          showMessage({ type: "danger", message: "Login failed" });
        }
      })
      .finally(() => {
        setLoading(false);
        confirmLockRef.current = false;
      });
  };

  const validateSignupPin = (text: string) => {
    if (loading || confirmLockRef.current) {
      return;
    }
    confirmLockRef.current = true;
    setLoading(true);
    apiClient
      .post("auth/user/confirm-otp", { otp: text, email_phone_number: item?.email_phone_number })
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
      .finally(() => {
        setLoading(false);
        confirmLockRef.current = false;
      });
  };

  const resendOtp = () => {
    if (resend) {
      return;
    }
    setResend(true);

    const isForgotPassword = item?.target === OTP_TARGET[1];
    const isLogin = item?.target === OTP_TARGET[2];
    const path = isForgotPassword
      ? "forgot/password"
      : isLogin
        ? "auth/user/request-login-otp"
        : "auth/user/resend-otp";
    const body = isForgotPassword
      ? { email_phone_number: item?.email_phone_number }
      : isLogin
        ? { email_phone_number: item?.email_phone_number }
        : {
            email_phone_number: item?.email_phone_number,
            role: registration?.type === "2" ? "driver" : "passenger",
          };

    apiClient
      .post(path, body)
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
            {item?.email_phone_number && !String(item.email_phone_number).includes("@")
              ? `Code sent to ${formatPhoneForDisplay(String(item.email_phone_number))}`
              : item?.text}
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
