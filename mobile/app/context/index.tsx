import {
  AuthState,
  setAuthData,
  updateToken,
  updateUser,
} from "@/store/AuthSlice";
import { PUSHER_AUTH } from "@/constants";
import { PUSHER_API_CLUSTER, PUSHER_API_KEY } from "@/constants/Keys";
import React, { ReactNode, createContext, useEffect, useState, useRef } from "react";
import { TRemoteNotification, TUser } from "@/types";
import { useDispatch, useSelector } from "react-redux";

import { Pusher } from "@pusher/pusher-websocket-react-native";
import apiClient from "@/utils/apiClient";
import { resetSubscription } from "@/store/AppSlice";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import { safeShowMessage } from "@/utils/safeShowMessage";
import { getErrorMessage } from "@/utils/errorHandler";
import useNotification from "@/hooks/useNotification";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import AppStore from "@/store";
import { pusherManager } from "@/utils/pusherManager";

interface IContext {
  currentUser: {
    profile: Partial<TUser>;
  };
  apiConfig: object;
  getCurrentUser: () => void;
  apiConfigFormData: object;
  LogoutUser: (loading: React.Dispatch<React.SetStateAction<boolean>>) => void;
  DeleteUser: (loading: React.Dispatch<React.SetStateAction<boolean>>) => void;
  pusher: Pusher;
  notificationEvent: TRemoteNotification;
}

export const AppContext = createContext<IContext>({
  currentUser: { profile: {} },
  apiConfig: {},
  getCurrentUser: () => {},
  apiConfigFormData: {},
  LogoutUser: () => {},
  DeleteUser: () => {},
  pusher: Pusher.getInstance(),
  notificationEvent: {
    title: "",
    body: "",
    data: {} as TRemoteNotification["data"],
  },
});

export default function GlobalContext({
  children,
}: Readonly<{ children: ReactNode }>) {
  const dispatch = useDispatch();
  const [currentUser, setCurrentUser] = useState<{ profile: Partial<TUser> }>({
    profile: {},
  });
  const { token } = useSelector(AuthState);
  
  // Fetch public configuration from backend (Pusher keys, etc.)
  const { config: publicConfig } = usePublicConfig();

  const pusher = Pusher.getInstance();
  const { notificationEvent } = useNotification();
  const pusherInitializedRef = useRef(false);

  const apiConfig = {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  };

  // Initialize Pusher - wait for config to load (from backend or fallback)
  useEffect(() => {
    // Only initialize if we have a token, haven't initialized yet, and have valid Pusher config
    if (!pusherInitializedRef.current && token && publicConfig.pusher.key) {
      pusherInitializedRef.current = true;

      // Use keys from backend config (or fallback from app.json)
      const pusherKey = publicConfig.pusher.key;
      const pusherCluster = publicConfig.pusher.cluster;

      pusher
        .init({
          apiKey: pusherKey,
          cluster: pusherCluster,
          authEndpoint: PUSHER_AUTH,
          onError: (message, code, e) => {
            // Completely suppress quota errors - they're just noise from over-quota accounts
            // Check both string and number formats
            if (code === 4004 || code === "4004" || message?.includes("over quota")) {
              return; // Silently ignore quota errors
            }
            // Only log non-quota errors
            console.log(`onError: ${message} code: ${code} exception: ${e}`);
          },

          onAuthorizer: async function onAuthorizer(channelName, socketId) {
            const dta = {
              socket_id: socketId, // Send socket ID for authentication
              channel_name: channelName, // Specify the private channel
            };

            // Get the current token from Redux store (might be refreshed)
            const currentToken = AppStore.getState().Auth.token;
            if (!currentToken) {
              console.log('No token available for Pusher authentication');
              return null;
            }

            const authConfig = {
              headers: {
                Authorization: `Bearer ${currentToken}`,
                Accept: "application/json",
              },
            };

            try {
              const response = await apiClient.post(PUSHER_AUTH, dta, authConfig);

              // Backend returns auth directly (not wrapped in data.data)
              let auth = response?.data;
              return auth;
            } catch (err: any) {
              // Handle specific error cases
              if (err?.response?.status === 401) {
                console.log('Pusher auth failed with 401 - token might be expired');
                // The token refresh should have been attempted by apiClient interceptor
                // Try one more time with the potentially refreshed token
                const refreshedToken = AppStore.getState().Auth.token;
                if (refreshedToken && refreshedToken !== currentToken) {
                  console.log('Retrying Pusher auth with refreshed token');
                  const retryConfig = {
                    headers: {
                      Authorization: `Bearer ${refreshedToken}`,
                      Accept: "application/json",
                    },
                  };
                  try {
                    const retryResponse = await apiClient.post(PUSHER_AUTH, dta, retryConfig);
                    return retryResponse?.data;
                  } catch (retryErr: any) {
                    const retryErrorMsg = getErrorMessage(retryErr, 'Pusher auth retry failed');
                    console.log('Pusher auth retry also failed:', retryErrorMsg);
                  }
                }
              } else if (err?.response?.data?.code !== 4004) {
                // Only log if it's not a quota error
                const errorMsg = getErrorMessage(err, 'Pusher auth error');
                console.log('Pusher auth error:', errorMsg);
              }
              return null;
            }
          },
        })
        .then(async () => {
          // Initialize Pusher Manager after Pusher is initialized
          pusherManager.initialize(pusher);
          try {
            await pusher.connect();
          } catch (err: any) {
            // Suppress quota errors
            if (err?.code !== 4004) {
              const errorMsg = getErrorMessage(err, 'Pusher connect error');
              console.log("pusher-connect-error: ", errorMsg);
            }
          }
        })
        .catch((err: any) => {
          // Suppress quota errors
          if (err?.code !== 4004) {
            const errorMsg = getErrorMessage(err, 'Pusher error');
            console.log("pusher-error: ", errorMsg);
          }
          pusherInitializedRef.current = false; // Reset on error so it can retry
        });
    }

    // Cleanup on unmount or when token is removed
    return () => {
      if (pusherInitializedRef.current && !token) {
        try {
          pusher.disconnect();
        } catch (err) {
          // Ignore disconnect errors
        }
        pusherInitializedRef.current = false;
      }
    };
  }, [token, publicConfig.pusher.key, publicConfig.pusher.cluster]); // Re-run if config changes

  const apiConfigFormData = {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "multipart/form-data",
    },
  };

  const getCurrentUser = () => {
    // Only fetch user if authenticated
    if (!token) {
      console.log("⚠️ Skipping getCurrentUser: No authentication token");
      return;
    }

    apiClient
      // Use relative path so apiClient baseURL + interceptors behave correctly
      .get("auth/user/me")
      .then(({ data }) => {
        // Backend may return either:
        // - { profile: {...} }  (legacy/mobile-friendly)
        // - { data: { user: {...} } } (Laravel-style)
        const profile = data?.profile ?? data?.data?.user;
        if (profile) {
          const payload = { profile };
          dispatch(updateUser(payload));
          setCurrentUser(payload);
        }
      })
      .catch((err) => {
        // Suppress all errors during initialization to prevent app crashes
        // 401 = not authenticated (expected)
        // 404 = driver profile not found (expected for passengers)
        // Only log errors for debugging, don't show messages during app initialization
        if (err?.response?.status !== 401 && err?.response?.status !== 404) {
          // Safely log error data without rendering
          const errorData = err?.response?.data;
          if (errorData) {
            const errorMessage = errorData?.message || 
              (typeof errorData?.error === 'string' ? errorData.error : errorData?.error?.message) ||
              'An error occurred';
            console.log('getCurrentUser error:', errorMessage);
          }
          // Don't show error messages during app initialization to prevent crashes
          // Errors will be handled by individual screens when they load
        }
      });
  };

  const clearCache = () => {
    if (pusherInitializedRef.current) {
      pusher.disconnect();
      pusherInitializedRef.current = false;
    }
    dispatch(resetSubscription());
    dispatch(
      setAuthData({
        registration: {
          type: "1",
        },
      })
    );
    dispatch(updateUser({ profile: {} }));
    setCurrentUser({ profile: {} });
    dispatch(updateToken(null));
    router.navigate("/");
  };

  const LogoutUser = (
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    apiClient
      .post("auth/user/signout", {})
      .then(({ data }) => {
        // Use safeShowMessage to ensure message is always a string
        safeShowMessage({
          type: "info",
          message: data?.message || 'Operation completed successfully',
        });
      })
      .catch((err) => {
        // Safely log error data without rendering
        const errorData = err?.response?.data;
        if (errorData) {
          const errorMessage = errorData?.message || 
            (typeof errorData?.error === 'string' ? errorData.error : errorData?.error?.message) ||
            'An error occurred';
          console.log('LogoutUser/DeleteUser error:', errorMessage);
        }
        // Use safeShowMessage to prevent error object rendering issues
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => {
        clearCache();
        loading(false);
      });
  };
  const DeleteUser = (
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    apiClient
      .delete("auth/user/delete/account")
      .then(({ data }) => {
        clearCache();
        // Use safeShowMessage to ensure message is always a string
        safeShowMessage({
          type: "info",
          message: data?.message || 'Operation completed successfully',
        });
      })
      .catch((err) => {
        // Safely log error data without rendering
        const errorData = err?.response?.data;
        if (errorData) {
          const errorMessage = errorData?.message || 
            (typeof errorData?.error === 'string' ? errorData.error : errorData?.error?.message) ||
            'An error occurred';
          console.log('LogoutUser/DeleteUser error:', errorMessage);
        }
        // Use safeShowMessage to prevent error object rendering issues
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => loading(false));
  };

  useEffect(() => {
    if (token) {
      getCurrentUser();
    }
  }, [token]);

  const global = React.useMemo(
    () => ({
      currentUser,
      apiConfig,
      getCurrentUser,
      apiConfigFormData,
      LogoutUser,
      DeleteUser,
      pusher,
      notificationEvent,
    }),
    [
      currentUser,
      apiConfig,
      getCurrentUser,
      apiConfigFormData,
      LogoutUser,
      DeleteUser,
      pusher,
      notificationEvent,
    ]
  );

  return <AppContext.Provider value={global}>{children}</AppContext.Provider>;
}
