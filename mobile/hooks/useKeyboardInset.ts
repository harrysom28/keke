import { useEffect, useState } from "react";
import { Dimensions, Keyboard, KeyboardEvent, Platform } from "react-native";

/**
 * Visible window height sitting above the keyboard.
 * Android `adjustResize` already shrinks `windowHeight`; do not subtract again.
 */
export function heightAboveKeyboard(
  windowHeight: number,
  keyboardHeight: number
): number {
  if (keyboardHeight <= 0) {
    return windowHeight;
  }
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyResized =
    Platform.OS === "android" &&
    windowHeight < screenHeight - keyboardHeight * 0.35;
  if (windowAlreadyResized) {
    return windowHeight;
  }
  return Math.max(240, windowHeight - keyboardHeight);
}

/**
 * Keyboard height while visible. Use with bottom-anchored sheets (e.g. transparent
 * Modal) via marginBottom on the sheet so fields stay above the keyboard.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setInset(e.endCoordinates.height);
    };
    const onHide = () => {
      setInset(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      setInset(0);
    };
  }, [enabled]);

  return inset;
}
