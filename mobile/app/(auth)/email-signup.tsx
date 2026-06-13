import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import React, { useRef, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";

import AuthForm from "@/components/AuthForm";
import FormInput from "@/components/formInput";
import { validators } from "@/utils/formValidators";
import apiClient from "@/utils/apiClient";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useRouter } from "expo-router";
import { verticalScale } from "@/constants/Metrics";
import { getUniqueId } from "react-native-device-info";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { useDispatch } from "react-redux";
import { updateRefreshToken, updateToken, updateUser } from "@/store/AuthSlice";

const EmailSignUp = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const submitLockRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async () => {
    if (submitLockRef.current || loading) {
      return;
    }

    const name = state.name.trim();
    const email = state.email.trim();
    const password = state.password;
    const confirmPassword = state.confirmPassword;

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

    if (password !== confirmPassword) {
      return showMessage({ type: "warning", message: "Passwords do not match" });
    }

    submitLockRef.current = true;
    setLoading(true);

    try {
      const device_id = await getUniqueId().catch(() => "mobile");
      const device_token = await requestUserNotificationPermission();
      const { data } = await apiClient.post("auth/email/register", {
        name,
        email,
        password,
        device_id,
        device_token,
      });

      showMessage({
        type: "success",
        message: data.message || "Account created successfully",
      });
      dispatch(updateToken(data?.authorisation?.token));
      dispatch(updateRefreshToken(data?.authorisation?.refresh_token || null));
      if (data?.data?.user) {
        dispatch(updateUser({ profile: data.data.user }));
      }
      router.replace("/");
    } catch (err) {
      showErrorMessage(err);
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  return (
    <AuthForm
      current=""
      setCurrent={() => {}}
      height={320}
      footer={
        <Text
          style={tw.style(`text-[#5A5A5A] text-lg self-center mt-4`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Already have an account?{" "}
          <Text
            onPress={() => router.push("/login")}
            style={tw.style(`text-base-green text-lg`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Sign In
          </Text>
        </Text>
      }
    >
      <Text
        style={tw.style(`text-[#5A5A5A] text-sm mb-1`, {
          fontFamily: "RobotoRegular",
        })}
      >
        Create an account with email (for testing)
      </Text>

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
        onChangeText={(password) => setState((prev) => ({ ...prev, password }))}
        placeholder="Password"
        secureTextEntry
        validate={validators.passwordRequired()}
      />

      <FormInput
        value={state.confirmPassword}
        onChangeText={(confirmPassword) =>
          setState((prev) => ({ ...prev, confirmPassword }))
        }
        placeholder="Confirm password"
        secureTextEntry
        validate={validators.passwordRequired()}
      />

      <View style={tw`flex-row gap-x-2`}>
        <MaterialIcons name="check-circle" size={21} color="#43A048" />
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

export default EmailSignUp;
