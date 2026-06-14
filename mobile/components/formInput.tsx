import {
  KeyboardTypeOptions,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useCallback, useMemo, useState } from "react";

import { Octicons } from "@expo/vector-icons";
import tw from "@/lib/tailwind";
import { verticalScale } from "@/constants/Metrics";
import { debounce } from "@/utils/debounce";

export type ValidateFn = (value: string) => string | undefined;

/** Custom fonts often hide secureTextEntry bullets on Android — use system font when masked. */
function inputFontFamily(secureMasked: boolean): string {
  if (Platform.OS === "android" && secureMasked) {
    return "sans-serif-medium";
  }
  return "RobotoMedium";
}

interface Props {
  type?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  /** When true, password is visible while typing; tap eye to mask. When false, password is masked; tap eye to reveal. */
  passwordVisibleByDefault?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  height?: number;
  multiline?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  /** Validation runs on blur and (debounced) during typing after first blur. Return error message or undefined if valid. */
  validate?: ValidateFn;
  /** Validate when field loses focus. Default true when validate is provided. */
  validateOnBlur?: boolean;
  /** Re-validate during typing after first blur. Default true. Debounce 400ms. */
  validateOnChange?: boolean;
}

const FormInput = ({
  type = "default",
  secureTextEntry = false,
  passwordVisibleByDefault = false,
  placeholder = "",
  placeholderTextColor = "#D0D0D0",
  height = 40,
  multiline = false,
  value = "",
  onChangeText,
  editable = true,
  validate,
  validateOnBlur = true,
  validateOnChange = true,
}: Props) => {
  const [show, setShow] = useState(secureTextEntry && !passwordVisibleByDefault);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const runValidate = useCallback(
    (val?: string) => {
      if (!validate) return;
      const v = val ?? value;
      setError(validate(v));
    },
    [validate, value]
  );

  const debouncedValidate = useMemo(
    () =>
      validateOnChange && validate
        ? debounce((val: string) => {
            if (!validate) return;
            setError(validate(val));
          }, 400)
        : () => {},
    [validate, validateOnChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (validate && validateOnBlur) {
      runValidate();
    }
  }, [validate, validateOnBlur, runValidate]);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      if (touched && validate && validateOnChange) {
        debouncedValidate(text);
      }
    },
    [onChangeText, touched, validate, validateOnChange, debouncedValidate]
  );

  const hasError = !!error;
  const borderColor = hasError ? "#F9111F" : "#b8b8b8";
  const isMaskedPassword = secureTextEntry && show;

  return (
    <View style={tw`relative`}>
      <TextInput
        style={tw.style(
          `w-full text-sm border py-1.5 px-3.5 rounded-[8px]`,
          secureTextEntry && `pr-14`,
          {
            height: verticalScale(height),
            fontFamily: inputFontFamily(isMaskedPassword),
            color: "#262628",
            verticalAlign: multiline ? "top" : "middle",
            borderColor,
            borderWidth: 1,
          }
        )}
        keyboardType={type}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        secureTextEntry={show}
        multiline={multiline}
        value={value}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
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
      {hasError && (
        <Text
          style={tw.style(`text-[12px] text-base-error mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {error}
        </Text>
      )}
    </View>
  );
};

export default FormInput;
