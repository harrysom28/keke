import { Platform } from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Some Android OEMs + edge-to-edge windows report `bottom: 0` while the system
 * nav bar (3-button or gesture) still sits over the bottom of the screen.
 */
const ANDROID_NAV_FALLBACK_PX = 48;

/**
 * Live safe-area insets with fallback to initial window metrics (helps inside
 * Modal and when `StatusBar.currentHeight` is undefined on iOS).
 */
export function useCombinedSafeInsets() {
  const insets = useSafeAreaInsets();
  const fromMetrics = Math.max(
    insets.bottom,
    initialWindowMetrics?.insets.bottom ?? 0
  );
  const bottom =
    fromMetrics > 0
      ? fromMetrics
      : Platform.OS === "android"
        ? ANDROID_NAV_FALLBACK_PX
        : 0;

  return {
    ...insets,
    top: Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0),
    bottom,
  };
}

/**
 * Bottom padding for sticky sheet footers so primary actions clear system nav.
 * `bottomInset` should come from `useCombinedSafeInsets().bottom`.
 */
export function sheetFooterBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset + 12, 24);
}
