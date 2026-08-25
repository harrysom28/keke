import { Platform, ScrollView, type ScrollViewProps } from "react-native";
import React from "react";

import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";

/**
 * Full-screen form scroller: pads for the keyboard and brings the focused
 * field into view. Do not wrap this in KeyboardAvoidingView — that double-lifts
 * on Android where the window already resizes.
 */
export function KeyboardFormScrollView({
  children,
  contentContainerStyle,
  style,
  nestedScrollEnabled = true,
  ...rest
}: ScrollViewProps) {
  const insets = useCombinedSafeInsets();

  return (
    <ScrollView
      style={style}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets
      nestedScrollEnabled={nestedScrollEnabled}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        { flexGrow: 1, paddingBottom: Math.max(insets.bottom, 24) + 12 },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
