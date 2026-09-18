import {
  Platform,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";
import React from "react";

import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import {
  FOCUS_REVEAL_GAP,
  useFocusedInputReveal,
  useKeyboardInset,
} from "@/hooks/useKeyboardInset";

/**
 * Full-screen form scroller: pads for the keyboard overlay (edge-to-edge
 * Android) and brings the focused field into view. Do not wrap this in
 * KeyboardAvoidingView — that double-lifts when the window already resizes.
 */
export function KeyboardFormScrollView({
  children,
  contentContainerStyle,
  style,
  nestedScrollEnabled = true,
  onScroll,
  scrollEventThrottle,
  ...rest
}: ScrollViewProps) {
  const insets = useCombinedSafeInsets();
  const keyboardInset = useKeyboardInset(true);
  const scrollRef = React.useRef<ScrollView>(null);
  const reveal = useFocusedInputReveal(scrollRef);
  const flattened = StyleSheet.flatten(contentContainerStyle);
  const callerPad =
    flattened && typeof flattened === "object" && typeof flattened.paddingBottom === "number"
      ? flattened.paddingBottom
      : Math.max(insets.bottom, 24) + 12;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    reveal.onScroll(event);
    onScroll?.(event);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets={keyboardInset <= 0}
      nestedScrollEnabled={nestedScrollEnabled}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={scrollEventThrottle ?? reveal.scrollEventThrottle}
      contentContainerStyle={[
        { flexGrow: 1 },
        contentContainerStyle,
        {
          paddingBottom:
            callerPad +
            (keyboardInset > 0 ? keyboardInset + FOCUS_REVEAL_GAP : 0),
        },
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
