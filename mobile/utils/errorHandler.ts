/**
 * Centralized error handler utility
 * Extracts string messages from various error formats to prevent React rendering errors
 */

export interface ErrorLike {
  message?: string;
  error?: string | { message?: string; name?: string };
  response?: {
    data?: {
      message?: string | object;
      error?: string | object | { message?: string; name?: string };
    };
    status?: number;
  };
  statusCode?: number;
  status?: number;
  isOperational?: boolean;
  name?: string;
}

/**
 * Extracts a string error message from various error formats
 * @param error - Error object, string, or any error-like object
 * @param fallback - Fallback message if no error message can be extracted
 * @returns A safe string error message
 */
export const getErrorMessage = (error: any, fallback: string = 'An unexpected error occurred'): string => {
  // Handle null/undefined
  if (!error) {
    return fallback;
  }

  // If it's already a string, return it
  if (typeof error === 'string') {
    return error.trim() || fallback;
  }

  // Handle Error objects
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Handle API response errors (Axios format)
  if (error?.response?.data) {
    const data = error.response.data;
    
    // Try message field first
    if (data.message) {
      if (typeof data.message === 'string') {
        return data.message;
      }
      // If message is an object, try to extract from it
      if (typeof data.message === 'object') {
        return data.message.message || data.message.error || data.message.name || String(data.message) || fallback;
      }
    }
    
    // Try error field
    if (data.error) {
      if (typeof data.error === 'string') {
        return data.error;
      }
      // If error is an object, try to extract from it
      if (typeof data.error === 'object') {
        return data.error.message || data.error.name || String(data.error) || fallback;
      }
    }
  }

  // Handle nested error objects
  if (error?.error) {
    if (typeof error.error === 'string') {
      return error.error;
    }
    if (typeof error.error === 'object') {
      return error.error.message || error.error.name || String(error.error) || fallback;
    }
  }

  // Handle direct message property
  if (error?.message) {
    if (typeof error.message === 'string') {
      return error.message;
    }
    // If message is an object, try to extract from it
    if (typeof error.message === 'object') {
      return error.message.message || error.message.error || error.message.name || String(error.message) || fallback;
    }
  }

  // Handle name property (for Error-like objects)
  if (error?.name && typeof error.name === 'string') {
    return error.name;
  }

  // Try to stringify the error as last resort
  try {
    const stringified = String(error);
    if (stringified !== '[object Object]' && stringified !== '{}') {
      return stringified;
    }
  } catch {
    // Ignore stringification errors
  }

  // Final fallback
  return fallback;
};

/**
 * Creates a safe error object that can be safely passed to React components
 * @param error - Any error-like object
 * @param fallback - Fallback message
 * @returns An Error object with a string message
 */
export const createSafeError = (error: any, fallback: string = 'An unexpected error occurred'): Error => {
  const message = getErrorMessage(error, fallback);
  const safeError = new Error(message);
  
  // Preserve status code if available
  if (error?.response?.status) {
    (safeError as any).status = error.response.status;
  } else if (error?.status) {
    (safeError as any).status = error.status;
  } else if (error?.statusCode) {
    (safeError as any).status = error.statusCode;
  }
  
  // Preserve isAuthError flag
  if (error?.isAuthError) {
    (safeError as any).isAuthError = true;
  }
  
  return safeError;
};

/**
 * Checks if an error is an authentication error
 */
export const isAuthError = (error: any): boolean => {
  return (
    error?.isAuthError === true ||
    error?.response?.status === 401 ||
    error?.status === 401 ||
    error?.statusCode === 401
  );
};

/**
 * Checks if an error is a network error
 */
export const isNetworkError = (error: any): boolean => {
  return (
    !error?.response && // No response means network issue
    (error?.message?.includes('Network') ||
     error?.message?.includes('timeout') ||
     error?.message?.includes('ECONNREFUSED') ||
     error?.code === 'ECONNREFUSED' ||
     error?.code === 'ETIMEDOUT')
  );
};

/**
 * Convenience function to show error messages using react-native-flash-message
 * This ensures errors are always displayed as strings
 */
export const showErrorMessage = (
  error: any,
  options?: {
    type?: "success" | "warning" | "danger" | "info";
    duration?: number;
    fallback?: string;
  }
) => {
  const { showMessage } = require("react-native-flash-message");
  const errorMessage = getErrorMessage(error, options?.fallback || 'An error occurred');
  
  showMessage({
    type: options?.type || "danger",
    message: errorMessage,
    duration: options?.duration || 3000,
  });
};

export default getErrorMessage;
