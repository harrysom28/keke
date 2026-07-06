import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { AuthState, updateRefreshToken, updateToken, updateUser } from "@/store/AuthSlice";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocalSearchParams, useRouter } from "expo-router";

import AuthForm from "@/components/AuthForm";
import { COMPLETE_SIGNUP, ONBOARDING_RIDER_COMPLETE } from "@/constants";
import { getApiUrlWithOverride, IS_PHYSICAL_DEVICE } from "@/utils/apiUrlOverride";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import axios from "axios";
import apiClient from "@/utils/apiClient";
import { getUniqueId } from "react-native-device-info";
import { markLocationDisclosurePending } from "@/utils/locationDisclosure";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { verticalScale } from "@/constants/Metrics";

const Tab = ["Complete Profile"];

const Authenticate = () => {
  const dispatch = useDispatch();
  const { registration } = useSelector(AuthState);
  const router = useRouter();
  const params = useLocalSearchParams<{ otp?: string; email_phone_number?: string; fromLogin?: string }>();
  const otp = params?.otp;
  const fromLogin = params?.fromLogin === "1";
  const email_phone_number = params?.email_phone_number ?? registration?.email_phone_number ?? undefined;

  const [current, setCurrent] = useState(Tab[0]);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState({
    name: "",
    email: "",
  });

  const handleSubmit = async () => {
    const fullnameRegex = /^([A-Za-z'-]+)\s+([A-Za-z'-]+)$/;
    const fullname = state?.name?.trim();
    if (!fullnameRegex.test(fullname)) {
      return showMessage({
        type: "warning",
        message: "Invalid!\nInput Firstname and Lastname separated with a space",
      });
    }

    if (state.email?.trim() && !/^\S+@\S+\.\S+$/.test(state.email.trim())) {
      return showMessage({ type: "warning", message: "Invalid email format" });
    }

    if (!fromLogin) {
      if (!email_phone_number?.trim()) {
        return showMessage({ type: "warning", message: "Session missing email/phone." });
      }
      if (!otp?.trim()) {
        return showMessage({ type: "warning", message: "Session missing OTP." });
      }
    }

    setLoading(true);

    if (fromLogin) {
      apiClient
        .post(ONBOARDING_RIDER_COMPLETE, {
          full_name: state.name,
          ...(state.email?.trim() && { email: state.email.trim() }),
        })
        .then(({ data }) => {
          showMessage({ type: "success", message: data.message });
          if (data?.data?.user) {
            dispatch(updateUser({ profile: data.data.user }));
          }
          router.replace("/");
        })
        .catch((err) => {
          const msg = err?.response?.data?.message || "Failed to complete profile";
          showMessage({ type: "danger", message: msg });
        })
        .finally(() => setLoading(false));
      return;
    }

    const device_id = await getUniqueId();

    // Push token is best-effort. Signup completion must succeed even if this fails.
    let device_token = "";
    try {
      device_token = await requestUserNotificationPermission();
    } catch (tokenError) {
      console.warn(
        "Push token unavailable, continuing signup without it:",
        tokenError
      );
    }

    const payload: Record<string, unknown> = {
      otp: String(otp).trim(),
      email_phone_number: String(email_phone_number).trim(),
      name: state.name,
      device_id,
      device_token,
    };
    if (state.email?.trim()) {
      payload.email = state.email.trim();
    }

    axios
      .post(COMPLETE_SIGNUP, payload)
      .then(async ({ data }) => {
        showMessage({ type: "success", message: data.message });
        dispatch(updateToken(data?.authorisation?.token));
        dispatch(updateRefreshToken(data?.authorisation?.refresh_token || null));
        if (data?.data?.user) {
          dispatch(updateUser({ profile: data.data.user }));
        }
        if (registration?.type === "2") {
          router.navigate({
            pathname: "/driverinfo",
            params: { name: state.name },
          });
        } else {
          await markLocationDisclosurePending("rider");
          router.navigate("/");
        }
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn("Complete signup error:", err?.response?.data || err.message);
        }
        if (err?.response?.status === 422 && err?.response?.data?.errors) {
          const errors = err.response.data.errors;
          const firstError = Object.values(errors)[0];
          const errorMessage = Array.isArray(firstError) ? firstError[0] : firstError;
          showMessage({
            type: "danger",
            message: errorMessage || "Validation error. Please check your input.",
          });
        } else if (err?.response?.data?.message) {
          const msg =
            typeof err.response.data.message === "string"
              ? err.response.data.message
              : String(err.response.data.message || "An error occurred");
          showMessage({ type: "danger", message: msg });
        } else if (err?.response?.data?.error) {
          const errorData = err.response.data.error;
          const msg =
            typeof errorData === "string"
              ? errorData
              : errorData?.message || errorData?.name || "An error occurred";
          showMessage({ type: "danger", message: msg });
        } else if (!err?.response) {
          const apiBase = getApiUrlWithOverride();
          const networkMessage = IS_PHYSICAL_DEVICE
            ? "Cannot reach Keke Ride. Set your computer's IP in mobile/utils/apiUrlOverride.ts, then reload."
            : "Cannot reach Keke Ride. Check that the backend is running, then try again.";
          showMessage({ type: "danger", message: networkMessage });
          if (__DEV__) console.warn("API base:", apiBase);
        } else {
          showErrorMessage(err);
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <AuthForm current={current} setCurrent={setCurrent} Tab={Tab}>
      <FormInput
        value={state.name}
        onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
        placeholder="Full name"
        validate={validators.fullnameRequired()}
      />
      <FormInput
        value={state.email}
        onChangeText={(email) => setState((prev) => ({ ...prev, email }))}
        placeholder="Email (optional)"
        type="email-address"
        validate={(v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? "Invalid email" : undefined)}
      />
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!state.name.trim()}
        style={tw.style(
          `flex-row justify-center items-center bg-base-green rounded-[8px] mt-12`,
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
            {fromLogin ? "Update" : "Complete"}
          </Text>
        )}
      </TouchableOpacity>
    </AuthForm>
  );
};

export default Authenticate;
