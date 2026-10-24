import { useWindowDimensions } from "react-native";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";

type UseSheetHeightArgs = {
  /** Laid-out body height from onContentLayout. Omit to use the cap. */
  measuredContent?: number | null;
  /** Max fraction of the visible area. */
  cap?: number;
  min?: number;
};

/**
 * Sheet height that stays inside the visible screen.
 * Upper bound is (screenHeight - insets.top - insets.bottom - 48) * cap.
 * When measured content is smaller than that bound, the sheet shrinks to it.
 * footerReserve is the sticky-footer padding that clears the gesture pill.
 */
export function useSheetHeight({
  measuredContent,
  cap = 0.9,
  min = 240,
}: UseSheetHeightArgs = {}): { height: number; footerReserve: number } {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useCombinedSafeInsets();
  const upper = Math.max(
    0,
    (screenHeight - insets.top - insets.bottom - 48) * cap
  );
  const measured =
    typeof measuredContent === "number" &&
    Number.isFinite(measuredContent) &&
    measuredContent > 0
      ? measuredContent
      : null;
  const preferred = measured != null && measured < upper ? measured : upper;
  const height = upper > 0 ? Math.min(Math.max(preferred, min), upper) : min;
  const footerReserve = Math.max(insets.bottom, 24) + 16;
  return { height: Math.round(height), footerReserve };
}
