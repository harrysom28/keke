import React from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dismisses the keyboard when otherwise-empty sheet space is pressed.
 * Interactive children keep their own responder and continue receiving taps.
 */
export function KeyboardDismissSurface({ children, style }: Props) {
  return (
    <Pressable
      accessible={false}
      onPress={Keyboard.dismiss}
      style={[styles.surface, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    // Not `flex: 1`: inside an auto-height parent (e.g. @devvie/bottom-sheet's
    // content container) a 0 flex-basis has nothing to resolve against, so the
    // surface collapses and its children squash to zero height. Growing from an
    // `auto` basis fills the space when the parent has one and stays
    // content-sized when it does not.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
  },
});
