import { showMessage } from "react-native-flash-message";

import { UserMessages } from "@/constants/userMessages";
import { getErrorMessage, isNetworkError } from "@/utils/errorHandler";

type ToastType = "success" | "warning" | "danger" | "info";

function resolveErrorText(error: unknown, fallback?: string): string {
  if (isNetworkError(error)) {
    return UserMessages.networkError;
  }
  return getErrorMessage(error, fallback ?? UserMessages.genericError);
}

function show(type: ToastType, message: string, duration = 3000) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return;
  showMessage({ type, message: text, duration });
}

export const notify = {
  success(message: string, duration?: number) {
    show("success", message, duration ?? 3500);
  },
  error(error: unknown, options?: { fallback?: string; duration?: number }) {
    show("danger", resolveErrorText(error, options?.fallback), options?.duration ?? 4000);
  },
  warning(message: string, duration?: number) {
    show("warning", message, duration ?? 3500);
  },
  info(message: string, duration?: number) {
    show("info", message, duration ?? 3000);
  },
};

export default notify;
