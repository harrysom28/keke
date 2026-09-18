import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import React, { ComponentProps, forwardRef } from "react";
import { StyleSheet, type ViewStyle } from "react-native";

import { KeyboardDismissSurface } from "@/components/KeyboardDismissSurface";
import { useKeyboardSheetLayout } from "@/hooks/useKeyboardInset";

type SheetProps = ComponentProps<typeof BottomSheet>;

type Props = Omit<
  SheetProps,
  "height" | "disableKeyboardHandling" | "disableBodyPanning"
> & {
  /** Pixel height while the keyboard is hidden. */
  height: number;
  /** When false, skip keyboard listeners (e.g. sheet not mounted/open). */
  keyboardEnabled?: boolean;
};

/**
 * @devvie/bottom-sheet with the keyboard policy this app actually uses:
 * library keyboard handling OFF, body panning OFF, sheet lifted by padding
 * the overlay inset (edge-to-edge Android). Do not set
 * disableKeyboardHandling on callers — the library PanResponder fights
 * TextInput/ScrollView on Android.
 */
const KeyboardAwareBottomSheet = forwardRef<BottomSheetMethods, Props>(
  function KeyboardAwareBottomSheet(
    { children, height, keyboardEnabled = true, style, ...rest },
    ref
  ) {
    const { height: sheetHeight, paddingBottom } = useKeyboardSheetLayout(
      height,
      keyboardEnabled
    );
    const flattened = StyleSheet.flatten(style as ViewStyle) ?? {};
    const basePad = Number(flattened.paddingBottom) || 0;

    return (
      <BottomSheet
        {...rest}
        ref={ref}
        height={sheetHeight}
        disableKeyboardHandling={true}
        disableBodyPanning={true}
        style={{
          ...flattened,
          ...(paddingBottom > 0
            ? { paddingBottom: basePad + paddingBottom }
            : null),
        }}
      >
        <KeyboardDismissSurface>{children}</KeyboardDismissSurface>
      </BottomSheet>
    );
  }
);

export default KeyboardAwareBottomSheet;
