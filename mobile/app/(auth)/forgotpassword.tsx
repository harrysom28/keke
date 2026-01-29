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
import { useLocalSearchParams, useRouter } from "expo-router";

import { FORGOT_PASSWORD } from "@/constants";
import { OTP_TARGET } from "./otpcode";
import { WINDOW_WIDTH } from "@/constants/Metrics";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";

interface LProps {
  title: string;
  text: string;
  icon: () => JSX.Element;
}

function ListItem({ title, text, icon }: LProps) {
  return (
    <TouchableOpacity
      style={tw`flex-row gap-x-1.5 items-center px-4 py-2 bg-[#3C8F7C26] border border-base-green rounded-[4px]`}
    >
      {icon()}

      <View>
        <Text
          style={tw.style(`text-sm text-black`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {title}
        </Text>
        <Text
          style={tw.style(`text-sm text-[#5A5A5A]`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function maskString(str: string, factor: number) {
  // Check if the string is longer than 2 characters
  if (str.length > 2) {
    // Mask everything but the last two characters
    let maskedPart = "*".repeat(str.length - factor);
    let lastTwoChars = str.slice(-factor);
    return maskedPart + lastTwoChars;
  }

  // If the string is 2 characters or less, return it as is
  return str;
}

const ForgotPassword = () => {
  const router = useRouter();
  const { value, type, text } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    setLoading(true);
    axios
      .post(FORGOT_PASSWORD, { email_phone_number: value })
      .then(({ data }) => {
        showMessage({
          type: "success",
          message: data.message,
        });
        let item = {
          title: type + " Verification",
          text,
          target: OTP_TARGET[1],
          email_phone_number: value,
        };
        router.push({ pathname: `/otpcode`, params: item });
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
            Forgot Password
          </Text>
          <Text
            style={tw.style(`text-lg text-[#A0A0A0] text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Select which contact details should we use to reset your password
          </Text>

          <View style={tw`self-start w-full flex-col gap-y-4`}>
            <ListItem
              icon={() =>
                type === "Phone" ? (
                  <Svg width="50" height="51" viewBox="0 0 50 51" fill="none">
                    <Circle
                      cx="25"
                      cy="25.5"
                      r="24.5"
                      fill="white"
                      stroke="#3C8F7C"
                    />
                    <Path
                      d="M30.3697 16.5H20.7899C18.1459 16.5 16 18.6363 16 21.2707V26.9994V27.9574C16 30.5919 18.1459 32.7282 20.7899 32.7282H22.2269C22.4855 32.7282 22.8304 32.9006 22.9932 33.1114L24.4302 35.0177C25.0625 35.8608 26.0971 35.8608 26.7294 35.0177L28.1663 33.1114C28.3484 32.8719 28.6357 32.7282 28.9327 32.7282H30.3697C33.0137 32.7282 35.1596 30.5919 35.1596 27.9574V21.2707C35.1596 18.6363 33.0137 16.5 30.3697 16.5ZM21.7479 26.0798C21.2114 26.0798 20.7899 25.6487 20.7899 25.1218C20.7899 24.5949 21.221 24.1638 21.7479 24.1638C22.2748 24.1638 22.7059 24.5949 22.7059 25.1218C22.7059 25.6487 22.2843 26.0798 21.7479 26.0798ZM25.5798 26.0798C25.0433 26.0798 24.6218 25.6487 24.6218 25.1218C24.6218 24.5949 25.0529 24.1638 25.5798 24.1638C26.1067 24.1638 26.5378 24.5949 26.5378 25.1218C26.5378 25.6487 26.1163 26.0798 25.5798 26.0798ZM29.4117 26.0798C28.8752 26.0798 28.4537 25.6487 28.4537 25.1218C28.4537 24.5949 28.8848 24.1638 29.4117 24.1638C29.9386 24.1638 30.3697 24.5949 30.3697 25.1218C30.3697 25.6487 29.9482 26.0798 29.4117 26.0798Z"
                      fill="#3C8F7C"
                    />
                  </Svg>
                ) : (
                  <Svg width="50" height="51" viewBox="0 0 50 51" fill="none">
                    <Circle
                      cx="25"
                      cy="25.5"
                      r="24.5"
                      fill="white"
                      stroke="#3C8F7C"
                    />
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M19.9054 16.5C18.2468 16.5 16.7469 16.9145 15.6583 17.9254C14.5593 18.9459 14 20.4613 14 22.4054V29.5946C14 31.5388 14.5593 33.0541 15.6583 34.0746C16.7469 35.0855 18.2468 35.5 19.9054 35.5H30.1757C31.8343 35.5 33.3342 35.0855 34.4227 34.0746C35.5218 33.0541 36.0811 31.5388 36.0811 29.5946V22.4054C36.0811 20.4613 35.5218 18.9459 34.4227 17.9254C33.3342 16.9145 31.8343 16.5 30.1757 16.5H19.9054ZM32.4644 22.264C32.801 22.0039 32.863 21.5201 32.6028 21.1835C32.3428 20.8469 31.8591 20.7849 31.5224 21.045L25.8254 25.447C25.3631 25.8044 24.7178 25.8044 24.2555 25.447L18.5586 21.045C18.2219 20.7849 17.7382 20.8469 17.4781 21.1835C17.218 21.5201 17.28 22.0039 17.6166 22.264L23.3136 26.6661C24.3308 27.452 25.7502 27.452 26.7674 26.6661L32.4644 22.264Z"
                      fill="#3C8F7C"
                    />
                  </Svg>
                )
              }
              title={"Via " + type}
              text={maskString(value, type === "Phone" ? 2 : 12)}
            />
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
            Continue
          </Text>
        )}
      </TouchableOpacity>
    </ImageBackground>
  );
};

export default ForgotPassword;
