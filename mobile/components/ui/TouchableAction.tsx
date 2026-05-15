import React from "react";
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";

const MIN_TOUCH = 48;
const DEFAULT_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type Props = PressableProps & {
  label: string;
  labelStyle?: TextStyle;
  containerStyle?: ViewStyle;
  variant?: "primary" | "danger" | "ghost";
};

/**
 * Accessible touch target (min 48dp) for bottom sheets and small screens.
 * Uses RN Pressable — works reliably inside @devvie/bottom-sheet (gesture-handler often does not).
 */
export function TouchableAction({
  label,
  labelStyle,
  containerStyle,
  variant = "primary",
  disabled,
  hitSlop = DEFAULT_HIT_SLOP,
  ...rest
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "danger" && styles.danger,
        variant === "ghost" && styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        containerStyle,
      ]}
      {...rest}
    >
      <Text
        style={[
          styles.label,
          variant === "primary" && styles.labelPrimary,
          variant === "danger" && styles.labelDanger,
          variant === "ghost" && styles.labelGhost,
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#3C8F7C",
  },
  danger: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#EF4444",
  },
  ghost: {
    backgroundColor: "transparent",
    minHeight: 44,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontFamily: "RobotoMedium",
    textAlign: "center",
  },
  labelPrimary: {
    color: "#FFFFFF",
  },
  labelDanger: {
    color: "#EF4444",
  },
  labelGhost: {
    color: "#6B7280",
    fontFamily: "RobotoRegular",
    fontSize: 14,
  },
});
