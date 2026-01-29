import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { AuthState, updateRefreshToken, updateToken } from "@/store/AuthSlice";
import { Country, State } from "country-state-city";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocalSearchParams, useRouter } from "expo-router";

import AuthForm from "@/components/AuthForm";
import { COMPLETE_SIGNUP } from "@/constants";
import { Dropdown } from "react-native-element-dropdown";
import FormInput from "@/components/formInput";
import axios from "axios";
import { getUniqueId } from "react-native-device-info";
import { requestUserNotificationPermission } from "@/utils/notifications";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { verticalScale } from "@/constants/Metrics";

const Tab = ["Authenticate"];

interface SProps {
  placeholder: string;
  data: Array<{ label: string; value: string }>;
  onChange: (val: string) => void;
  value: string;
}

const SelectItem = ({
  placeholder,
  data = [],
  onChange,
  value = "",
}: SProps) => {
  return (
    <Dropdown
      style={tw.style(
        `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
        {
          fontFamily: "RobotoMedium",
        }
      )}
      mode="modal"
      data={data}
      value={value}
      placeholder={placeholder}
      search={false}
      maxHeight={300}
      labelField={"label"}
      valueField={"value"}
      itemTextStyle={tw.style(`text-black text-sm`, {
        fontFamily: "RobotoMedium",
      })}
      selectedTextStyle={tw.style(`text-black text-sm`, {
        fontFamily: "RobotoMedium",
      })}
      placeholderStyle={tw.style(`text-[#D0D0D0] text-[16px]`, {
        fontFamily: "RobotoMedium",
      })}
      containerStyle={tw.style(`text-black text-xs shadow-none border mt-1`)}
      onChange={(item) => {
        console.log(item?.value);
        onChange(item?.value);
      }}
    />
  );
};

const Authenticate = () => {
  const dispatch = useDispatch();
  const { registration } = useSelector(AuthState);
  const router = useRouter();
  const { otp, email_phone_number } = useLocalSearchParams();

  const [current, setCurrent] = useState(Tab[0]);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState({
    name: "",
    country: "Nigeria",
    state: "",
    password: "",
    password_confirmation: "",
  });

  const CountryIndex = Country.getAllCountries().find(
    (i) => i.name === state.country
  );
  const States =
    CountryIndex === undefined
      ? [{ name: "Please Select a Country" }]
      : State.getStatesOfCountry(CountryIndex?.isoCode);

  const handleSubmit = async () => {
    let fullnameRegex = /^([A-Za-z'-]+)\s+([A-Za-z'-]+)$/;
    let fullname = state?.name?.trim();
    if (!fullnameRegex.test(fullname)) {
      return showMessage({
        type: "warning",
        message:
          "Invalid!\nInput Firstname and Lastname seperated with a space",
      });
    }

    if (state.password !== state.password_confirmation)
      return showMessage({
        type: "warning",
        message: "Passwords do not match",
      });
    if (state.country === "")
      return showMessage({
        type: "warning",
        message: "Select a country",
      });

    if (state.state === "")
      return showMessage({
        type: "warning",
        message: "Select a state",
      });

    setLoading(true);

    const device_id = await getUniqueId();
    const device_token = await requestUserNotificationPermission();
    axios
      .post(COMPLETE_SIGNUP, {
        otp,
        // Prefer route param (passed from otpcode), fallback to redux if later expanded.
        email_phone_number,
        ...state,
        device_id,
        device_token,
      })
      .then(({ data }) => {
        console.log(data);
        showMessage({
          type: "success",
          message: data.message,
        });
        dispatch(updateToken(data?.authorisation?.token));
        dispatch(updateRefreshToken(data?.authorisation?.refresh_token || null));
        
        // Update user in Redux with the response data
        if (data?.data?.user) {
          dispatch(updateUser({ profile: data.data.user }));
        }
        
        // Pass name via route params for driver registration
        if (registration?.type === "2") {
          router.navigate({
            pathname: "/driverinfo",
            params: { name: state.name },
          });
        } else {
          router.navigate("/");
        }
      })
      .catch((err) => {
        console.log("Complete signup error:", err?.response?.data || err.message, err?.response?.status || "Network Error");
        
        // Handle Laravel validation errors (422)
        if (err?.response?.status === 422 && err?.response?.data?.errors) {
          const errors = err.response.data.errors;
          // Get first error message from validation errors
          const firstError = Object.values(errors)[0];
          const errorMessage = Array.isArray(firstError) ? firstError[0] : firstError;
          showMessage({
            type: "danger",
            message: errorMessage || "Validation error. Please check your input.",
          });
        } else if (err?.response?.data?.message) {
          // Ensure message is a string
          const errorMessage = typeof err.response.data.message === 'string' 
            ? err.response.data.message 
            : String(err.response.data.message || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        } else if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
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
      .finally(() => setLoading(false));
  };

  return (
    <AuthForm current={current} setCurrent={setCurrent} Tab={Tab}>
      <FormInput
        value={state.name}
        onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
        placeholder="Fullname"
      />
      <FormInput
        value={state.password}
        onChangeText={(password) => setState((prev) => ({ ...prev, password }))}
        placeholder="Enter Your Password"
        secureTextEntry
      />
      <FormInput
        value={state.password_confirmation}
        onChangeText={(password_confirmation) =>
          setState((prev) => ({ ...prev, password_confirmation }))
        }
        placeholder="Confirm Your Password"
        secureTextEntry
      />

      <SelectItem
        placeholder="Country"
        value={state.country}
        onChange={(country) => setState((prev) => ({ ...prev, country }))}
        data={Country.getAllCountries().map(({ name }) => ({
          label: name,
          value: name,
        }))}
      />

      <SelectItem
        placeholder="State"
        value={state.state}
        onChange={(state) => setState((prev) => ({ ...prev, state }))}
        data={States.map(({ name }) => ({
          label: name,
          value: name,
        }))}
      />

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={
          state.name === "" ||
          state.password === "" ||
          state.password_confirmation === ""
        }
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
            Update
          </Text>
        )}
      </TouchableOpacity>
    </AuthForm>
  );
};

export default Authenticate;
