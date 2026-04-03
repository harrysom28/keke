import React, { memo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";

interface BottomUIProps {
  children?: React.ReactNode;
  style?: ViewStyle;
}

function BottomUIComponent({ children, style }: BottomUIProps) {
  return <View style={[styles.container, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 80,
    backgroundColor: "transparent",
  },
});

export const BottomUI = memo(BottomUIComponent);
