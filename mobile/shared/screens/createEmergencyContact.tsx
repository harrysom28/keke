import {
  ActivityIndicator,
  ImageBackground,
  KeyboardTypeOptions,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CREATE_EMERGENCY_CONTACT,
  UPDATE_EMERGENCY_CONTACT,
} from "@/constants";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import apiClient from "@/utils/apiClient";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { KeyboardFormScrollView } from "@/components/KeyboardFormScrollView";
import { useIsFocused } from "@react-navigation/native";

interface IProps {
  placeholder: string;
  type?: KeyboardTypeOptions;
  value: string;
  onChange: (text: string) => void;
  processError: (
    text: string,
    setErrorState: React.Dispatch<
      React.SetStateAction<{
        status: boolean;
        text: string;
      }>
    >
  ) => void;
}

const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout; // Timeout for debouncing

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

function InputItem({
  type = "default",
  placeholder = "",
  processError,
  value,
  onChange,
}: IProps) {
  const [errorState, setErrorState] = useState({ status: false, text: "" });

  // Debounced function to set the final value after the delay
  const debouncedInputHandler = useCallback(
    debounce((input: string) => {
      processError(input, setErrorState);
    }, 500), // 500ms delay
    []
  );

  const handleTextChange = (input: string) => {
    onChange(input);
    // setText(input); // Update the immediate value
    debouncedInputHandler(input); // Call the debounced function
  };

  return (
    <View style={tw`relative`}>
      <TextInput
        value={value}
        onChangeText={handleTextChange}
        keyboardType={type}
        style={tw.style(
          `text-[16px] text-black px-2 h-[45px] border-b border-[#737B7D]`,
          {
            fontFamily: "RobotoRegular",
          }
        )}
        placeholder={placeholder}
        placeholderTextColor="#8E8E8E"
      />
      <Text
        style={tw.style(`text-[11px] text-[#D40D0D] mt-1`, {
          fontFamily: "RobotoRegular",
          opacity: errorState.status ? 1 : 0,
        })}
      >
        {errorState.text}
      </Text>
    </View>
  );
}

const defaultState = {
  name: "",
  email: "",
  phone_number: "",
  address: "",
};

const nigerianPhoneRegex = /^(\+?234|0)[789][01]\d{8}$/;

const SharedCreateEmergencyContact = ({ params }) => {
  const { type, person_id } = params;
  const { apiConfig } = useContext(AppContext);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(defaultState);

  const handleSubmit = () => {
    if (state.name === "" || state.phone_number === "")
      return showMessage({
        type: "warning",
        message: "Please fill in all required fields",
      });

    let url =
      type === "edit"
        ? UPDATE_EMERGENCY_CONTACT + person_id
        : CREATE_EMERGENCY_CONTACT;

    const payload = {
      name: state.name,
      phone: state.phone_number,
      relationship: "emergency",
    };

    setLoading(true);
    const request = type === "edit" ? axios.patch(url, payload, apiConfig) : axios.post(url, payload, apiConfig);
    request
      .then(({ data }) => {
        showMessage({
          type: "success",
          message: data.message,
        });
        setState(defaultState);
        router.back();
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "warning",
            message: err?.response?.data.message,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  let isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused && type === "edit" && person_id) {
      setLoading(true);
      apiClient
        .get("emergency/contact")
        .then(({ data }) => {
          const contacts = data?.data?.emergency_contacts ?? data?.data ?? [];
          const list = Array.isArray(contacts) ? contacts : [];
          const contact = list.find(
            (c: any) =>
              (c.contact_id || c._id || "") === String(person_id)
          );
          if (contact) {
            setState({
              name: contact.name ?? "",
              email: contact.email ?? "",
              phone_number: contact.phone ?? contact.phone_number ?? "",
              address: contact.address ?? "",
            });
          }
        })
        .catch((err) => {
          if (err?.response?.data?.message) {
            showMessage({
              type: "danger",
              message: err?.response?.data?.message,
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused, type, person_id]);
  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#F9111F] mb-1 px-4 pt-14 pb-5 z-50`)}>
        <View style={tw`flex-row items-center justify-between w-[80%]`}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={tw`bg-white p-1 rounded-full`}
          >
            <AntDesign name="left" size={24} color="black" />
          </TouchableOpacity>
          <Text
            style={tw.style(`text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            Emergency Contact
          </Text>
        </View>
      </View>
      <KeyboardFormScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
      >
          <View style={tw`flex-col mt-14 gap-y-2 pt-4 pb-5 px-6`}>
            <InputItem
              value={state.name}
              onChange={(name) => setState((prev) => ({ ...prev, name }))}
              placeholder="Name of Contact"
              processError={(text, setErrorState) => {
                if (text.length > 0 && text.length < 5) {
                  setErrorState({
                    status: true,
                    text: "Too short! minumum length is 5",
                  });
                  setHasError(true);
                } else {
                  setErrorState({ status: false, text: "" });
                  setHasError(false);
                }
              }}
            />
            <InputItem
              value={state.phone_number}
              onChange={(phone_number) =>
                setState((prev) => ({ ...prev, phone_number }))
              }
              type="number-pad"
              placeholder="Contact Phone"
              processError={(text, setErrorState) => {
                if (text.length > 0 && !nigerianPhoneRegex.test(text.trim())) {
                  setErrorState({
                    status: true,
                    text: "Enter a valid number",
                  });
                  setHasError(true);
                } else {
                  setErrorState({ status: false, text: "" });
                  setHasError(false);
                }
              }}
            />
          </View>
          <Pressable
            disabled={hasError}
            onPress={handleSubmit}
            style={tw`bg-base-green mt-14 mx-6 py-3.5`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-center text-base text-white`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Save
              </Text>
            )}
          </Pressable>
        </KeyboardFormScrollView>
    </ImageBackground>
  );
};

export default SharedCreateEmergencyContact;
