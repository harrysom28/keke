import { showMessage as flashShowMessage } from "react-native-flash-message";

import { UserMessages } from "@/constants/userMessages";
import { getErrorMessage } from "@/utils/errorHandler";

/**
 * Safe wrapper for showMessage that ensures the message is always a string
 */
export const safeShowMessage = (options: {
  type?: "success" | "warning" | "danger" | "info";
  message: unknown;
  duration?: number;
  [key: string]: unknown;
}) => {
  const messageString = getErrorMessage(
    options.message,
    options.type === "success"
      ? UserMessages.success.saved
      : UserMessages.genericError
  );

  try {
    flashShowMessage({
      ...options,
      message: messageString,
    });
  } catch (error) {
    console.warn("Failed to show message:", error);
  }
};

export default safeShowMessage;
