import { showMessage as flashShowMessage } from "react-native-flash-message";

/**
 * Safe wrapper for showMessage that ensures the message is always a string
 * This prevents "Objects are not valid as a React child" errors
 */
export const safeShowMessage = (options: {
  type?: "success" | "warning" | "danger" | "info";
  message: any;
  duration?: number;
  [key: string]: any;
}) => {
  let messageString: string = 'An error occurred'; // Default fallback

  try {
    // Extract message from various formats
    if (typeof options.message === 'string') {
      messageString = options.message;
    } else if (options.message && typeof options.message === 'object') {
      // Handle error objects - check for common error object properties
      if (options.message.message) {
        messageString = typeof options.message.message === 'string' 
          ? options.message.message 
          : String(options.message.message);
      } else if (options.message.error) {
        messageString = typeof options.message.error === 'string' 
          ? options.message.error 
          : (options.message.error?.message || String(options.message.error));
      } else if (options.message.name) {
        messageString = String(options.message.name);
      } else {
        // Try to stringify the object safely
        try {
          messageString = JSON.stringify(options.message);
        } catch {
          messageString = 'An error occurred';
        }
      }
    } else if (options.message !== null && options.message !== undefined) {
      // Fallback for any other type
      messageString = String(options.message);
    }

    // Ensure message is not empty and is a valid string
    if (!messageString || typeof messageString !== 'string' || messageString.trim() === '') {
      messageString = 'An error occurred';
    }
  } catch (error) {
    // If anything goes wrong, use default message
    messageString = 'An error occurred';
  }

  // Call the original showMessage with the safe string
  try {
    flashShowMessage({
      ...options,
      message: messageString,
    });
  } catch (error) {
    // Silently fail if showMessage itself throws an error
    console.warn('Failed to show message:', error);
  }
};

export default safeShowMessage;
