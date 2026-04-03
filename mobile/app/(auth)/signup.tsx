import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import React, { useRef, useState } from "react";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import AuthForm from "@/components/AuthForm";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import GoogleAuthButton from "@/components/googleAuth";
import { OTP_TARGET } from "./otpcode";
import PhoneInput from "@perttu/react-native-phone-number-input";
import { REGISTER, VALIDATE_REFERRAL_CODE } from "@/constants";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useRouter } from "expo-router";
import { verticalScale } from "@/constants/Metrics";
import { useDispatch, useSelector } from "react-redux";
import { AuthState, updateRegistration } from "@/store/AuthSlice";

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

const SignUp = () => {
  const phoneInput = useRef<PhoneInput>(null);
  const router = useRouter();
  const dispatch = useDispatch();
  const { registration } = useSelector(AuthState);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState({
    referral_code: "",
  });

  const handleSubmit = async () => {
    const num = phoneInput?.current?.getNumberAfterPossiblyEliminatingZero()
      ?.formattedNumber as string;
    const isValidNumber = phoneInput?.current?.isValidNumber(num);

    if (!isValidNumber)
      return showMessage({
        type: "warning",
        message: "Please enter a valid phone number",
      });

    // Validate referral code exists if provided
    const trimmedReferral = state.referral_code?.trim() ?? "";
    if (trimmedReferral) {
      try {
        const { data } = await axios.get(VALIDATE_REFERRAL_CODE, {
          params: { code: trimmedReferral },
        });
        if (!data?.valid) {
          return showMessage({
            type: "warning",
            message: "Referral code not found. Please check and try again.",
          });
        }
      } catch {
        return showMessage({
          type: "warning",
          message: "Could not verify referral code. Please try again.",
        });
      }
    }

    // Determine role based on registration type: "1" = passenger, "2" = driver
    const role = registration?.type === "2" ? "driver" : "passenger";

    const dta = {
      email_phone_number: num.replace(/\+/g, ""),
      referral_code: state.referral_code,
      role,
    };

    const item = {
      title: "Phone Verification",
      text: "Enter your OTP code, sent to your device",
      type: "Phone",
      target: OTP_TARGET[0],
      email_phone_number: dta.email_phone_number,
    };

    setLoading(true);
    axios
      .post(REGISTER, dta)
      .then(({ data }) => {
        console.log("Registration response:", data);
        showMessage({
          type: "success",
          message: data.message || "OTP sent successfully",
        });

        // Check if OTP was actually sent
        if (data?.data?.otp_sent) {
          const { sms, email } = data.data.otp_sent;
          if (!sms && !email) {
            showMessage({
              type: "warning",
              message: "OTP generated but could not be sent. Please try resending.",
            });
          }
        }

        dispatch(updateRegistration({ ...registration, email_phone_number: dta?.email_phone_number }));
        router.push({ pathname: `/otpcode`, params: item });
      })
      .catch((err) => {
        console.log("Registration error:", err?.response?.data || err.message);
        
        // If OTP was generated but sending failed, still navigate to OTP screen
        if (!err?.response?.data?.otp_confirmed) {
          if (err?.response?.data?.message) {
            showMessage({
              type: "warning",
              message: err.response.data.message,
            });
          }
          dispatch(updateRegistration({ ...registration, email_phone_number: dta?.email_phone_number }));
          router.push({ pathname: `/otpcode`, params: item });
        } else if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err.response.data.message,
          });
        } else if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'Registration failed. Please try again.');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        } else {
          showMessage({
            type: "danger",
            message: "Registration failed. Please try again.",
          });
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
          Already have an account?
          <Text
            onPress={() => router.push("/login")}
            style={tw.style(`text-base-green text-lg`, {
              fontFamily: "RobotoMedium",
            })}
          >
            {" "}
            Sign In
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

      <View>
        <Text
          style={tw.style(`text-[15px] mb-2`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Referral Code (Optional)
        </Text>

        <FormInput
          value={state.referral_code}
          onChangeText={(referral_code) =>
            setState((prev) => ({ ...prev, referral_code }))
          }
          placeholder="Input code"
          validate={validators.referralCode("Referral code must be 4–64 letters or numbers")}
        />
      </View>

      <View style={tw`flex-row gap-x-2 `}>
        <MaterialIcons name="check-circle" size={21} color="#43A048" />
        <Text
          style={tw.style(
            `flex-row items-center gap-x-1 basis-[95%] text-xs text-[#B8B8B8]`,
            {
              fontFamily: "RobotoMedium",
            }
          )}
        >
          By signing up, you agree to the{" "}
          <Text
            onPress={() => router.push("/(auth)/terms")}
            style={tw.style(`text-xs text-base-green`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Terms of service
          </Text>
          {" "}and{" "}
          <Text
            onPress={() => router.push("/(auth)/terms")}
            style={tw.style(`text-xs text-base-green`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Privacy policy
          </Text>
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        style={tw.style(
          `flex-row justify-center items-center bg-base-green rounded-[8px]`,
          { height: verticalScale(40) }
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
            Sign Up
          </Text>
        )}
      </TouchableOpacity>

      <View style={tw.style("")}>
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

export default SignUp;
