import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useEffect, useRef, useState } from "react";
import Svg, { Path } from "react-native-svg";

import { AntDesign } from "@expo/vector-icons";
import AuthForm from "@/components/AuthForm";
import GoogleAuthButton from "@/components/googleAuth";
import PhoneInput from "@perttu/react-native-phone-number-input";
import apiClient from "@/utils/apiClient";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { verticalScale } from "@/constants/Metrics";

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
  const phoneInput = useRef<PhoneInput>(null);
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isFocused) return () => {};
  }, [isFocused]);

  const handleSubmit = async () => {
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
        if (err?.response?.data?.message) {
          showMessage({ type: "danger", message: err.response.data.message });
        } else if (err?.response?.status) {
          showMessage({ type: "danger", message: `Server error: ${err.response.status}` });
        } else {
          showMessage({ type: "danger", message: "Network error: Unable to reach server." });
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <AuthForm
      current=""
      setCurrent={() => {}}
      footer={
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
      }
    >
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

      <View>
        <View
          style={tw.style(
            "flex-row items-center justify-between gap-x-1.5 mb-3"
          )}
        >
          <View style={tw`h-[1px] basis-[43%] mt-1 bg-[#B8B8B8]`} />
          <Text
            style={tw.style("text-[#B8B8B8] text-base", {
              fontFamily: "RobotoMedium",
            })}
          >
            or
          </Text>
          <View style={tw`h-[1px] basis-[43%] mt-1 bg-[#B8B8B8]`} />
        </View>

        <View style={tw`flex-row justify-center items-center gap-x-4`}>
          <GoogleAuthButton />
          <TouchableOpacity
            style={tw`h-[48px] w-[48px] flex-row justify-center items-center border border-[#D0D0D0] rounded-[8px]`}
          >
            <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
              <Path
                d="M23 12C23 17.796 18.3012 22.5 12.5 22.5C6.69875 22.5 2 17.796 2 12C2 6.19875 6.69875 1.5 12.5 1.5C18.3012 1.5 23 6.19875 23 12Z"
                fill="#121212"
              />
              <Path
                d="M17.4216 9.34304C17.3643 9.37646 16.0003 10.0819 16.0003 11.6459C16.0646 13.4296 17.7216 14.0551 17.75 14.0551C17.7216 14.0885 17.4998 14.9072 16.843 15.7654C16.3217 16.5047 15.7432 17.25 14.8646 17.25C14.0289 17.25 13.7289 16.7573 12.7646 16.7573C11.729 16.7573 11.436 17.25 10.6431 17.25C9.76458 17.25 9.14315 16.4647 8.59345 15.7324C7.87932 14.7739 7.27233 13.2698 7.2509 11.8256C7.23646 11.0603 7.39392 10.308 7.79361 9.66904C8.35774 8.77699 9.36489 8.17143 10.4647 8.15146C11.3074 8.12498 12.0574 8.6906 12.5717 8.6906C13.0646 8.6906 13.986 8.15146 15.0286 8.15146C15.4786 8.1519 16.6786 8.27822 17.4216 9.34304ZM12.5005 7.99866C12.3505 7.29978 12.7646 6.60089 13.1503 6.15508C13.6432 5.61594 14.4216 5.25 15.0929 5.25C15.1357 5.94889 14.8641 6.63432 14.3787 7.13352C13.9432 7.67266 13.1932 8.07853 12.5005 7.99866Z"
                fill="white"
              />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>
    </AuthForm>
  );
};

export default Login;
