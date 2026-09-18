import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ModalProps,
} from "react-native";
import React from "react";

import tw from "@/lib/tailwind";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  /** Backdrop tap. Defaults to dismissing the keyboard, not closing the modal. */
  onBackdropPress?: () => void;
  children: React.ReactNode;
  animationType?: ModalProps["animationType"];
};

/**
 * Transparent bottom-anchored modal. Backdrop is a sibling of the sheet so it
 * never competes with gesture-handler buttons inside the card. Keyboard offset
 * is marginBottom (same as wallet / feedback review) — not KeyboardAvoidingView,
 * which double-lifts on some Android devices and is a different pattern.
 */
export function KeyboardSheetModal({
  visible,
  onRequestClose,
  onBackdropPress,
  children,
  animationType = "slide",
}: Props) {
  const keyboardInset = useKeyboardInset(visible);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      <View style={tw`flex-1 bg-[#1919194D]`}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onBackdropPress ?? Keyboard.dismiss}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View
          pointerEvents="box-none"
          style={[tw`flex-1 justify-end`, { marginBottom: keyboardInset }]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
