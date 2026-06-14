import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useEffect, useRef, useState } from "react";

import { AntDesign } from "@expo/vector-icons";
import AuthForm from "@/components/AuthForm";
import FormInput from "@/components/formInput";
import PhoneInput from "@perttu/react-native-phone-number-input";
import apiClient from "@/utils/apiClient";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { verticalScale } from "@/constants/Metrics";
import { getUniqueId } from "react-native-device-info";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { useDispatch } from "react-redux";
import { updateRefreshToken, updateToken, updateUser } from "@/store/AuthSlice";
import { validators } from "@/utils/formValidators";

const LOGIN_MODES = ["Phone OTP", "Email & Password"] as const;
type LoginMode = (typeof LOGIN_MODES)[number];

const renderDropdownImage = () => {
  return (
    <AntDesign
      name="down"
      size={18}
      style={tw`border-r border-[#DDDDDD] pr-1.5`}
      color="black"
    />
  );
};

const Login = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const phoneInput = useRef<PhoneInput>(null);
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<LoginMode>(
    params?.mode === "email" ? "Email & Password" : "Phone OTP"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isFocused) return () => {};
  }, [isFocused]);

  const completeAuthSession = (data: {
    message?: string;
    authorisation?: { token?: string; refresh_token?: string | null };
    data?: { user?: Record<string, unknown>; needs_onboarding?: boolean };
  }) => {
    showMessage({ type: "success", message: data.message || "Login successful" });
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
  };

  const handlePhoneSubmit = async () => {
    const num = phoneInput?.current?.getNumberAfterPossiblyEliminatingZero()
      ?.formattedNumber as string;
    const isValidNumber = phoneInput?.current?.isValidNumber(num);

    if (!isValidNumber)
      return showMessage({
        type: "warning",
        message: "Please enter a valid phone number",
      });

    const emailPhone = num.replace(/\+/g, "");

    setLoading(true);
    apiClient
      .post("auth/user/request-login-otp", { email_phone_number: emailPhone })
      .then(({ data }) => {
        showMessage({ type: "success", message: data.message });
        router.push({
          pathname: "/otpcode",
          params: {
            email_phone_number: emailPhone,
            target: "LOGIN",
            title: "Enter code",
            text: "We sent a login code to your device",
          },
        });
      })
      .catch((err) => {
        showErrorMessage(err);
      })
      .finally(() => setLoading(false));
  };

  const handleEmailSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return showMessage({ type: "warning", message: "Email is required" });
    }
    if (validators.emailRequired()(trimmedEmail)) {
      return showMessage({ type: "warning", message: "Please enter a valid email" });
    }
    if (!password.trim()) {
      return showMessage({ type: "warning", message: "Password is required" });
    }

    setLoading(true);
    try {
      const device_id = await getUniqueId().catch(() => "mobile");
      const device_token = await requestUserNotificationPermission();
      const { data } = await apiClient.post("auth/email/login", {
        email: trimmedEmail,
        password,
        device_id,
        device_token,
      });
      completeAuthSession(data);
    } catch (err) {
      showErrorMessage(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "Phone OTP") {
      void handlePhoneSubmit();
    } else {
      void handleEmailSubmit();
    }
  };

  return (
    <AuthForm
      current=""
      setCurrent={() => {}}
      footer={
        mode === "Phone OTP" ? (
          <Text
            style={tw.style(`text-[#5A5A5A] text-lg self-center mt-4`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Don't have an account?
            <Text
              onPress={() => router.push("/usertype")}
              style={tw.style(`text-base-green text-lg`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Sign Up
            </Text>
          </Text>
        ) : (
          <Text
            style={tw.style(`text-[#5A5A5A] text-lg self-center mt-4`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Don't have an account?{" "}
            <Text
              onPress={() => router.push("/usertype")}
              style={tw.style(`text-base-green text-lg`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Sign Up
            </Text>
          </Text>
        )
      }
    >
      <View
        style={tw.style(
          `flex-row border-b border-[#8E8E9340] pb-2 mb-1`,
        )}
      >
        {LOGIN_MODES.map((item) => (
          <Pressable
            key={item}
            onPress={() => setMode(item)}
            style={tw`flex-1 items-center`}
          >
            <Text
              style={tw.style(
                `text-sm text-center`,
                item === mode ? "text-[#262628]" : "text-[#C8C7CC]",
                {
                  fontFamily: item === mode ? "RobotoMedium" : "RobotoRegular",
                }
              )}
            >
              {item}
            </Text>
            {item === mode && (
              <View
                style={tw`w-[35px] h-[5px] mt-[3px] bg-base-green rounded-xl`}
              />
            )}
          </Pressable>
        ))}
      </View>

      {mode === "Phone OTP" ? (
        <>
          <PhoneInput
            ref={phoneInput}
            defaultCode="NG"
            layout="first"
            containerStyle={tw.style(
              `flex-row items-center gap-x-2 border border-[#b8b8b8] rounded-[8px] overflow-hidden`,
              { height: verticalScale(40) }
            )}
            codeTextStyle={tw.style(`h-full text-[15px]`, {
              fontFamily: "RobotoMedium",
            })}
            textInputProps={{
              placeholder: "Your mobile number",
              placeholderTextColor: "#D0D0D0",
            }}
            textInputStyle={tw.style(`h-full text-[15px] `, {
              fontFamily: "RobotoMedium",
            })}
            textContainerStyle={tw`bg-white`}
            renderDropdownImage={renderDropdownImage()}
            flagButtonStyle={tw`flex-row items-center pl-5`}
            filterProps={{ placeholder: "Search country" }}
          />

          <TouchableOpacity
            onPress={() => router.push("/(auth)/account-recovery")}
            style={tw`mb-1`}
          >
            <Text
              style={tw.style(`text-sm text-base-green`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Can't access your phone? Recover with email
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <FormInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            type="email-address"
            validate={validators.emailRequired()}
          />
          <FormInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            validate={validators.passwordRequired()}
          />
        </>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        style={tw.style(
          `flex-row justify-center items-center bg-base-green rounded-[8px] mt-5`,
          { height: verticalScale(45) }
        )}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text
            style={tw.style(`text-white text-base`, {
              fontFamily: "RobotoBold",
            })}
          >
            Sign In
          </Text>
        )}
      </TouchableOpacity>
    </AuthForm>
  );
};

export default Login;
