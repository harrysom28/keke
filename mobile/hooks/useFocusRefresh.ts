import { useRef, useCallback } from "react";
import { useIsFocused } from "@react-navigation/native";

export function useFocusRefresh(stallMs: number) {
  const lastRanAt = useRef<number>(0);
  const isFocused = useIsFocused();

  const runIfStale = useCallback(
    (callback: () => void) => {
      if (!isFocused) return;
      const now = Date.now();
      if (now - lastRanAt.current < stallMs) return;
      lastRanAt.current = now;
      callback();
    },
    [isFocused, stallMs]
  );

  return runIfStale;
}

