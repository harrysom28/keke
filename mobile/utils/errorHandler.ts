/**
 * Centralized error handler utility
 * Extracts string messages from various error formats to prevent React rendering errors
 */

import { UserMessages } from "@/constants/userMessages";

export interface ErrorLike {
  message?: string;
  error?: string | { message?: string; name?: string };
  response?: {
    data?: {
      message?: string | object;
      error?: string | object | { message?: string; name?: string };
      errors?: Record<string, string[] | string>;
      code?: string;
    };
    status?: number;
  };
  statusCode?: number;
  status?: number;
  isOperational?: boolean;
  name?: string;
  code?: string;
}

/** Known API error codes → user-friendly copy (when message is generic). */
const CODE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Insufficient wallet balance. Please top up to continue.",
  TOO_FAR_FROM_PICKUP: "You're too far from the pickup point. Move closer and try again.",
  OFFER_EXPIRED: "This ride offer has expired.",
  OFFER_GONE: "This ride is no longer available.",
};

function firstValidationMessage(errors: Record<string, string[] | string> | undefined): string | null {
  if (!errors || typeof errors !== "object") return null;
  for (const key of Object.keys(errors)) {
    const val = errors[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
      return val[0];
    }
    if (typeof val === "string" && val.trim()) {
      return val;
    }
  }
  return null;
}

function extractFromResponseData(data: Record<string, unknown> | undefined): string | null {
  if (!data || typeof data !== "object") return null;

  const validationMsg = firstValidationMessage(
    data.errors as Record<string, string[] | string> | undefined
  );
  if (validationMsg) return validationMsg;

  const code = typeof data.code === "string" ? data.code : null;
  const message = data.message;

  if (typeof message === "string" && message.trim()) {
    const trimmed = message.trim();
    if (trimmed.toLowerCase() === "validation failed" && validationMsg) {
      return validationMsg;
    }
    return trimmed;
  }

  if (message && typeof message === "object") {
    const m = message as { message?: string; error?: string; name?: string };
    if (m.message && typeof m.message === "string") return m.message;
    if (m.error && typeof m.error === "string") return m.error;
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  if (data.error && typeof data.error === "object") {
    const e = data.error as { message?: string; name?: string };
    if (e.message && typeof e.message === "string") return e.message;
  }

  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  return null;
}

/**
 * Extracts a string error message from various error formats
 */
export const getErrorMessage = (
  error: unknown,
  fallback: string = UserMessages.genericError
): string => {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error.trim() || fallback;
  }

  if (error && typeof error === "object" && "response" in error) {
    const data = (error as ErrorLike).response?.data;
    const fromData = extractFromResponseData(data as Record<string, unknown>);
    if (fromData) return fromData;
  }

  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (msg && msg !== "An error occurred" && msg !== "Request failed with status code") {
      return msg;
    }
  }

  const errObj = error as ErrorLike;

  if (errObj?.error) {
    if (typeof errObj.error === "string" && errObj.error.trim()) {
      return errObj.error;
    }
    if (typeof errObj.error === "object" && errObj.error.message) {
      return errObj.error.message;
    }
  }

  if (errObj?.message) {
    if (typeof errObj.message === "string" && errObj.message.trim()) {
      return errObj.message;
    }
    if (typeof errObj.message === "object") {
      const m = errObj.message as { message?: string; error?: string };
      if (m.message) return m.message;
      if (m.error) return m.error;
    }
  }

  if (errObj?.code && CODE_MESSAGES[errObj.code]) {
    return CODE_MESSAGES[errObj.code];
  }

  return fallback;
};

export const getApiErrorCode = (error: unknown): string | null => {
  const data = (error as ErrorLike)?.response?.data;
  if (data?.code && typeof data.code === "string") return data.code;
  return null;
};

export const createSafeError = (
  error: unknown,
  fallback: string = UserMessages.genericError
): Error => {
  const message = getErrorMessage(error, fallback);
  const safeError = new Error(message);

  const err = error as ErrorLike;
  if (err?.response?.status) {
    (safeError as { status?: number }).status = err.response.status;
  } else if (err?.status) {
    (safeError as { status?: number }).status = err.status;
  } else if (err?.statusCode) {
    (safeError as { status?: number }).status = err.statusCode;
  }

  if ((error as { isAuthError?: boolean })?.isAuthError) {
    (safeError as { isAuthError?: boolean }).isAuthError = true;
  }

  return safeError;
};

export const isAuthError = (error: unknown): boolean => {
  const err = error as ErrorLike & { isAuthError?: boolean };
  return (
    err?.isAuthError === true ||
    err?.response?.status === 401 ||
    err?.status === 401 ||
    err?.statusCode === 401
  );
};

export const isRateLimitError = (error: unknown): boolean => {
  const err = error as ErrorLike;
  return (
    err?.response?.status === 429 ||
    err?.status === 429 ||
    err?.statusCode === 429
  );
};

export const isNetworkError = (error: unknown): boolean => {
  const err = error as ErrorLike & { code?: string; message?: string };
  return (
    !err?.response &&
    (err?.message?.includes("Network") ||
      err?.message?.includes("network") ||
      err?.message?.includes("timeout") ||
      err?.message?.includes("ECONNREFUSED") ||
      err?.code === "ECONNREFUSED" ||
      err?.code === "ETIMEDOUT" ||
      err?.code === "ERR_NETWORK")
  );
};

export const showErrorMessage = (
  error: unknown,
  options?: {
    type?: "success" | "warning" | "danger" | "info";
    duration?: number;
    fallback?: string;
  }
) => {
  const { showMessage } = require("react-native-flash-message");
  const errorMessage = isNetworkError(error)
    ? UserMessages.networkError
    : getErrorMessage(error, options?.fallback ?? UserMessages.genericError);

  showMessage({
    type: options?.type || "danger",
    message: errorMessage,
    duration: options?.duration || 4000,
  });
};

export default getErrorMessage;
