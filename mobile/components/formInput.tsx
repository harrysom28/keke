import {
  KeyboardTypeOptions,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useState } from "react";

import { Octicons } from "@expo/vector-icons";
import tw from "@/lib/tailwind";
import { verticalScale } from "@/constants/Metrics";

interface Props {
  type?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  height?: number;
  multiline?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
}

const FormInput = ({
  type = "default",
  secureTextEntry = false,
  placeholder = "",
  placeholderTextColor = "#D0D0D0",
  height = 40,
  multiline = false,
  value = "",
  onChangeText,
  editable = true,
}: Props) => {
  const [show, setShow] = useState(secureTextEntry);

  return (
    <View style={tw`relative`}>
      <TextInput
        style={tw.style(
          `w-full text-sm border border-[#b8b8b8] py-1.5 px-3.5 rounded-[8px]`,
          secureTextEntry && `pr-14`,
          {
            height: verticalScale(height),
            fontFamily: "RobotoMedium",
            verticalAlign: multiline ? "top" : "middle",
          }
        )}
        keyboardType={type}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        secureTextEntry={show}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
      />
      {secureTextEntry && (
        <TouchableOpacity
          onPress={() => setShow((prev) => !prev)}
          style={tw`absolute top-[33%] right-4`}
        >
          <Octicons
            name={!show ? "eye" : "eye-closed"}
            size={18}
            color="black"
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default FormInput;
