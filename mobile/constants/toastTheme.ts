import Constants from "expo-constants";

/**
 * Toast/Flash message theme aligned with app design
 * Uses base-green (#3C8F7C) and base-error (#F9111F) from tailwind
 */
export const TOAST_COLORS = {
  success: "#3C8F7C", // base-green
  danger: "#F9111F", // base-error from app theme
  warning: "#F59E0B", // amber
  info: "#0284C7", // slate blue
  default: "#64748B", // slate gray
} as const;

export const TOAST_STYLE = {
  container: {
    borderRadius: 16,
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontFamily: "RobotoMedium" as const,
    fontSize: 15,
    textAlign: "center" as const,
    color: "#FFFFFF",
  },
  text: {
    fontFamily: "RobotoRegular" as const,
    fontSize: 14,
    textAlign: "center" as const,
    color: "rgba(255,255,255,0.95)",
  },
};

/** Top offset so toasts sit below status bar on both iOS and Android */
export const getStatusBarOffset = (): number => {
  return Constants.statusBarHeight ?? 0;
};
