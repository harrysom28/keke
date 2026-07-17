import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useRef, useState } from "react";
import { AntDesign } from "@expo/vector-icons";
import Checkbox from "expo-checkbox";
import AuthForm from "@/components/AuthForm";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import { OTP_TARGET } from "./otpcode";
import PhoneInput from "@perttu/react-native-phone-number-input";
import apiClient from "@/utils/apiClient";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useLocalSearchParams, useRouter } from "expo-router";
import { verticalScale } from "@/constants/Metrics";
import { useDispatch, useSelector } from "react-redux";
import {
  AuthState,
  updateRefreshToken,
  updateRegistration,
  updateToken,
  updateUser,
} from "@/store/AuthSlice";
import { getUniqueId } from "react-native-device-info";
import { queueLocationDisclosureIfNeeded } from "@/utils/locationDisclosure";
import { requestUserNotificationPermission } from "@/utils/notifications";

const SIGNUP_MODES = ["Phone OTP", "Email & Password"] as const;
type SignupMode = (typeof SIGNUP_MODES)[number];

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
  const emailPhoneInput = useRef<PhoneInput>(null);
  const submitLockRef = useRef(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { registration } = useSelector(AuthState);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SignupMode>(
    params?.mode === "email" ? "Email & Password" : "Phone OTP"
  );
  const [state, setState] = useState({
    referral_code: "",
    name: "",
    email: "",
    password: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(true);

  const role = registration?.type === "2" ? "driver" : "passenger";

  const completeEmailSignup = async (data: {
    message?: string;
    authorisation?: { token?: string; refresh_token?: string | null };
    data?: {
      user?: Record<string, unknown>;
      needs_onboarding?: boolean;
    };
  }) => {
    showMessage({
      type: "success",
      message: data.message || "Account created successfully",
    });
    dispatch(updateToken(data?.authorisation?.token));
    dispatch(updateRefreshToken(data?.authorisation?.refresh_token || null));
    if (data?.data?.user) {
      dispatch(updateUser({ profile: data.data.user }));
    }
    if (data?.data?.needs_onboarding || role === "driver") {
      router.replace({
        pathname: "/driverinfo",
        params: { name: state.name.trim() },
      });
    } else {
      await queueLocationDisclosureIfNeeded("rider");
      router.replace("/");
    }
  };

  const validateReferralIfProvided = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return true;
    try {
      const { data } = await apiClient.get("auth/referral-code/validate", {
        params: { code: trimmed },
        timeout: 15000,
      });
      if (!data?.valid) {
        showMessage({
          type: "warning",
          message: "Referral code not found. Please check and try again.",
        });
        return false;
      }
      return true;
    } catch {
      showMessage({
        type: "warning",
        message: "Could not verify referral code. Check your connection and try again.",
      });
      return false;
    }
  };

  const handlePhoneSubmit = async () => {
    if (submitLockRef.current || loading) return;

    const num = phoneInput?.current?.getNumberAfterPossiblyEliminatingZero()
      ?.formattedNumber as string;
    const isValidNumber = phoneInput?.current?.isValidNumber(num);

    if (!isValidNumber) {
      return showMessage({
        type: "warning",
        message: "Please enter a valid phone number",
      });
    }

    const referralOk = await validateReferralIfProvided(state.referral_code);
    if (!referralOk) return;

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
        showMessage({
          type: "success",
          message: data.message || "OTP sent successfully",
        });

        if (data?.data?.otp_sent) {
          const { sms, email } = data.data.otp_sent;
          if (!sms && !email) {
            showMessage({
              type: "warning",
              message: "OTP generated but could not be sent. Please try resending.",
            });
          }
        }

        dispatch(
          updateRegistration({
            ...registration,
            email_phone_number: dta.email_phone_number,
          })
        );
        router.push({ pathname: "/otpcode", params: item });
      })
      .catch((err: unknown) => {
        const e = err as {
          code?: string;
          message?: string;
          response?: {
            data?: {
              message?: string;
              error?: string | { message?: string; name?: string };
            };
          };
        };

        const msg = String(e?.message ?? "");
        const isTimeout = e?.code === "ECONNABORTED" || /timeout/i.test(msg);
        const noResponse = e?.response == null;
        if (isTimeout || noResponse) {
          showMessage({
            type: "danger",
            message: __DEV__
              ? "Could not reach the API (timeout or network). Check internet and API URL."
              : "Could not reach our servers. Check your internet connection and try again.",
          });
          return;
        }

        if (e?.response?.data?.message) {
          showMessage({ type: "danger", message: e.response.data.message });
        } else if (e?.response?.data?.error) {
          const errorData = e.response.data.error;
          const errorMessage =
            typeof errorData === "string"
              ? errorData
              : errorData?.message ||
                errorData?.name ||
                "Registration failed. Please try again.";
          showMessage({ type: "danger", message: errorMessage });
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

  const handleEmailSubmit = async () => {
    if (submitLockRef.current || loading) return;

    const name = state.name.trim();
    const email = state.email.trim();
    const password = state.password;

    const nameError = validators.fullnameRequired()(name);
    if (nameError) {
      return showMessage({ type: "warning", message: nameError });
    }

    const emailError = validators.emailRequired()(email);
    if (emailError) {
      return showMessage({ type: "warning", message: emailError });
    }

    const passwordError = validators.passwordRequired()(password);
    if (passwordError) {
      return showMessage({ type: "warning", message: passwordError });
    }

    const phoneNum = emailPhoneInput?.current
      ?.getNumberAfterPossiblyEliminatingZero()?.formattedNumber as string;
    const phoneDigits = phoneNum?.replace(/\s/g, "") ?? "";
    const phoneError = validators.nigerianPhoneRequired()(phoneDigits);
    if (phoneError) {
      return showMessage({ type: "warning", message: phoneError });
    }
    if (!emailPhoneInput?.current?.isValidNumber(phoneNum)) {
      return showMessage({
        type: "warning",
        message:
          "Enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)",
      });
    }

    const referralOk = await validateReferralIfProvided(state.referral_code);
    if (!referralOk) return;

    submitLockRef.current = true;
    setLoading(true);

    try {
      const device_id = await getUniqueId().catch(() => "mobile");

      // Push token is best-effort. Registration must succeed even if this fails.
      let device_token = "";
      try {
        device_token = await requestUserNotificationPermission();
      } catch (tokenError) {
        console.warn(
          "Push token unavailable, continuing registration without it:",
          tokenError
        );
      }

      const payload: Record<string, string> = {
        name,
        email,
        password,
        phone: phoneDigits,
        role,
        device_id,
      };
      if (device_token) payload.device_token = device_token;
      if (state.referral_code.trim()) {
        payload.referral_code = state.referral_code.trim();
      }

      const { data } = await apiClient.post("auth/email/register", payload);
      await completeEmailSignup(data);
    } catch (err) {
      showErrorMessage(err);
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  const handleSubmit = () => {
    if (!termsAccepted) {
      return showMessage({
        type: "warning",
        message:
          "Please accept the Terms of service and Privacy policy to continue.",
      });
    }
    if (mode === "Phone OTP") {
      void handlePhoneSubmit();
    } else {
      void handleEmailSubmit();
    }
  };

  const termsBlock = (
    <Pressable
      onPress={() => setTermsAccepted((prev) => !prev)}
      style={tw`flex-row gap-x-2 items-start`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: termsAccepted }}
    >
      <Checkbox
        value={termsAccepted}
        onValueChange={setTermsAccepted}
        color={termsAccepted ? tw.color("base-green") : undefined}
        style={tw`mt-0.5 border border-[#D0D0D0]`}
      />
      <Text
        style={tw.style(
          `flex-row items-center gap-x-1 basis-[95%] text-xs text-[#B8B8B8]`,
          { fontFamily: "RobotoMedium" }
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
        </Text>{" "}
        and{" "}
        <Text
          onPress={() => router.push("/(auth)/terms")}
          style={tw.style(`text-xs text-base-green`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Privacy policy
        </Text>
      </Text>
    </Pressable>
  );

  return (
    <AuthForm
      current=""
      setCurrent={() => {}}
      centerCard
      height={240}
      footer={
        <Text
          style={tw.style(`text-[#5A5A5A] text-lg self-center mt-3`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Already have an account?{" "}
          <Text
            onPress={() =>
              router.push(
                mode === "Email & Password"
                  ? { pathname: "/login", params: { mode: "email" } }
                  : "/login"
              )
            }
            style={tw.style(`text-base-green text-lg`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Sign In
          </Text>
        </Text>
      }
    >
      <View style={tw`flex-row border-b border-[#8E8E9340] pb-2 mb-1`}>
        {SIGNUP_MODES.map((item) => (
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
        </>
      ) : (
        <>
          <FormInput
            value={state.name}
            onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
            placeholder="Full name"
            validate={validators.fullnameRequired()}
          />
          <FormInput
            value={state.email}
            onChangeText={(email) => setState((prev) => ({ ...prev, email }))}
            placeholder="Email address"
            type="email-address"
            validate={validators.emailRequired()}
          />
          <FormInput
            value={state.password}
            onChangeText={(password) =>
              setState((prev) => ({ ...prev, password }))
            }
            placeholder="Password"
            secureTextEntry
            validate={validators.passwordRequired()}
          />
          <PhoneInput
            ref={emailPhoneInput}
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
              placeholder: "Phone number",
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
        </>
      )}

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
          validate={validators.referralCode(
            "Referral code must be 4–64 letters or numbers"
          )}
        />
      </View>

      {termsBlock}

      <TouchableOpacity
        onPress={handleSubmit}
        style={tw.style(
          `flex-row justify-center items-center bg-base-green rounded-[8px] mt-2`,
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
