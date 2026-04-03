import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Live safe-area insets with fallback to initial window metrics (helps inside
 * Modal and when `StatusBar.currentHeight` is undefined on iOS).
 */
export function useCombinedSafeInsets() {
  const insets = useSafeAreaInsets();
  return {
    ...insets,
    top: Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0),
    bottom: Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0),
  };
}
