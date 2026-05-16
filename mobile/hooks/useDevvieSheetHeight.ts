import { useCallback, useState } from "react";
import { useWindowDimensions } from "react-native";

/** Drag handle + vertical padding inside @devvie/bottom-sheet. */
export const DEVVIE_SHEET_CHROME_PX = 56;

export const SHEET_MAX_HEIGHT_RATIO = 0.92;

/**
 * Auto-size @devvie/bottom-sheet to content, capped at ~92% of screen.
 * Attach `onBodyLayout` to the column that wraps ScrollView + footer.
 */
export function useDevvieSheetHeight() {
  const { height: screenHeight } = useWindowDimensions();
  const maxSheetHeight = screenHeight * SHEET_MAX_HEIGHT_RATIO;
  const maxBodyHeight = maxSheetHeight - DEVVIE_SHEET_CHROME_PX;
  const [measuredBodyHeight, setMeasuredBodyHeight] = useState(0);

  const onBodyLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const h = Math.round(event.nativeEvent.layout.height);
      if (!h || h <= 0) return;
      setMeasuredBodyHeight((prev) => (Math.abs(prev - h) <= 2 ? prev : h));
    },
    []
  );

  const sheetHeight =
    measuredBodyHeight > 0
      ? Math.min(maxSheetHeight, measuredBodyHeight + DEVVIE_SHEET_CHROME_PX)
      : maxSheetHeight;

  return {
    sheetHeight,
    maxBodyHeight,
    maxSheetHeight,
    onBodyLayout,
    measuredBodyHeight,
  };
}
