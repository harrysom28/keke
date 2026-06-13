import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import React, { useRef, useState } from "react";
import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import AuthForm from "@/components/AuthForm";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import { OTP_TARGET } from "./otpcode";
import PhoneInput from "@perttu/react-native-phone-number-input";
import apiClient from "@/utils/apiClient";
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
  const submitLockRef = useRef(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const { registration } = useSelector(AuthState);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState({
    referral_code: "",
  });

  const handleSubmit = async () => {
    if (submitLockRef.current || loading) {
      return;
    }

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
        const { data } = await apiClient.get("auth/referral-code/validate", {
          params: { code: trimmedReferral },
          timeout: 15000,
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
          message: "Could not verify referral code. Check your connection and try again.",
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

    submitLockRef.current = true;
    setLoading(true);
    apiClient
      .post("auth/user/signup", dta, { timeout: 60000 })
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
      .catch((err: unknown) => {
        const e = err as {
          code?: string;
          message?: string;
          response?: { data?: { message?: string; error?: string | { message?: string; name?: string } } };
        };
        console.log("Registration error:", e?.response?.data || e?.message);

        const msg = String(e?.message ?? "");
        const isTimeout =
          e?.code === "ECONNABORTED" || /timeout/i.test(msg);
        const noResponse = e?.response == null;
        if (isTimeout || noResponse) {
          showMessage({
            type: "danger",
            message: __DEV__
              ? "Could not reach the API (timeout or network). Check internet, firewall, and EXPO_PUBLIC_API_URL / runtime override in mobile/.env."
              : "Could not reach our servers. Check your internet connection and try again.",
          });
          return;
        }

        // Do not navigate to OTP on error — the previous logic treated missing `otp_confirmed` as
        // "navigate anyway", which is always true on failures (e.g. 500 when Redis is down).
        if (e?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: e.response.data.message,
          });
        } else if (e?.response?.data?.error) {
          const errorData = e.response.data.error;
          const errorMessage =
            typeof errorData === "string"
              ? errorData
              : errorData?.message ||
                errorData?.name ||
                "Registration failed. Please try again.";
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
      .finally(() => {
        setLoading(false);
        submitLockRef.current = false;
      });
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
    </AuthForm>
  );
};

export default SignUp;
