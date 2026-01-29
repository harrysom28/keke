import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CREATE_EMERGENCY_CONTACT,
  EDIT_EMERGENCY_CONTACT,
  UPDATE_EMERGENCY_CONTACT,
} from "@/constants";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import SharedCreateEmergencyContact from "@/shared/screens/createEmergencyContact";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
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

  return <></>;
}

const defaultState = {
  name: "",
  email: "",
  phone_number: "",
  address: "",
};

const Emergency = () => {
  const params = useLocalSearchParams();

  return <SharedCreateEmergencyContact params={params} />;
};

export default Emergency;
