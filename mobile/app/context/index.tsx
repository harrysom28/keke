import {
  AuthState,
  setAuthData,
  updateToken,
  updateUser,
} from "@/store/AuthSlice";
import { PUSHER_AUTH } from "@/constants";
import { PUSHER_API_CLUSTER, PUSHER_API_KEY } from "@/constants/Keys";
import React, { ReactNode, createContext, useCallback, useEffect, useState, useRef } from "react";
import { TRemoteNotification, TUser } from "@/types";
import { useDispatch, useSelector } from "react-redux";

import { Pusher } from "@pusher/pusher-websocket-react-native";
import apiClient from "@/utils/apiClient";
import { AppDetailsState, resetSubscription } from "@/store/AppSlice";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import { safeShowMessage } from "@/utils/safeShowMessage";
import { getErrorMessage } from "@/utils/errorHandler";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { pusherManager } from "@/utils/pusherManager";
import { clearRecentPlacesCache } from "@/utils/recentPlacesCache";
import { persistor } from "@/store";
import { clearDriverState, clearRideState } from "@/store/AppSlice";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  /** True only after pusher.init() and pusher.connect() have completed. Guard subscribe calls with this to avoid native crash. */
  pusherReady: boolean;
  /** True after user-role hydration either succeeds or fails for the current token */
  roleLoaded: boolean;
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
  pusherReady: false,
  roleLoaded: false,
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
  const { latest_notification } = useSelector(AppDetailsState);
  
  // Fetch public configuration from backend (Pusher keys, etc.)
  const { config: publicConfig } = usePublicConfig();

  const pusher = Pusher.getInstance();
  const pusherInitializedRef = useRef(false);
  const [pusherReady, setPusherReady] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  /** Coalesce /auth/user/me: avoids blowing the global API IP limiter (driver map + home tab + location PATCH). */
  const getCurrentUserInFlightRef = useRef(false);
  const getCurrentUserLastStartRef = useRef(0);
  const GET_CURRENT_USER_MIN_MS = 8000;

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
            // Pusher types `code` as Number; normalize for comparison
            if (Number(code) === 4004 || message?.includes("over quota")) {
              return; // Silently ignore quota errors
            }
            // Only log non-quota errors
            console.log(`onError: ${message} code: ${code} exception: ${e}`);
          },

          onAuthorizer: async function onAuthorizer(channelName, socketId) {
            const dta = {
              socket_id: socketId,
              channel_name: channelName,
            };

            try {
              const response = await apiClient.post(PUSHER_AUTH, dta);
              return response?.data ?? null;
            } catch (err: any) {
              if (err?.response?.data?.code !== 4004) {
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
            setPusherReady(true);
          } catch (err: any) {
            // Suppress quota errors
            if (err?.code !== 4004) {
              const errorMsg = getErrorMessage(err, 'Pusher connect error');
              console.log("pusher-connect-error: ", errorMsg);
            }
            setPusherReady(false);
          }
        })
        .catch((err: any) => {
          // Suppress quota errors
          if (err?.code !== 4004) {
            const errorMsg = getErrorMessage(err, 'Pusher error');
            console.log("pusher-error: ", errorMsg);
          }
          pusherInitializedRef.current = false; // Reset on error so it can retry
          setPusherReady(false);
        });
    }

    // Cleanup on unmount or when token is removed
    return () => {
      if (pusherInitializedRef.current && !token) {
        setPusherReady(false);
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

  const getCurrentUser = useCallback(() => {
    if (!token) {
      console.log("⚠️ Skipping getCurrentUser: No authentication token");
      setRoleLoaded(false);
      return;
    }

    const now = Date.now();
    if (getCurrentUserInFlightRef.current) {
      return;
    }
    if (now - getCurrentUserLastStartRef.current < GET_CURRENT_USER_MIN_MS) {
      return;
    }
    getCurrentUserLastStartRef.current = now;
    getCurrentUserInFlightRef.current = true;

    setRoleLoaded(false);
    apiClient
      .get("auth/user/me")
      .then(({ data }) => {
        const profile = data?.profile ?? data?.data?.user;
        if (profile) {
          const payload = { profile };
          dispatch(updateUser(payload));
          setCurrentUser(payload);
        }
        setRoleLoaded(true);
      })
      .catch((err) => {
        if (err?.response?.status !== 401 && err?.response?.status !== 404) {
          const errorData = err?.response?.data;
          if (errorData) {
            const errorMessage = errorData?.message || 
              (typeof errorData?.error === 'string' ? errorData.error : errorData?.error?.message) ||
              'An error occurred';
            console.log('getCurrentUser error:', errorMessage);
          }
        }
        setRoleLoaded(true);
      })
      .finally(() => {
        getCurrentUserInFlightRef.current = false;
      });
  }, [token, dispatch]);

  const clearCache = async () => {
    if (pusherInitializedRef.current) {
      setPusherReady(false);
      pusher.disconnect();
      pusherInitializedRef.current = false;
    }
    clearRecentPlacesCache();
    dispatch(resetSubscription());
    dispatch(clearRideState());
    dispatch(clearDriverState());
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
    setRoleLoaded(false);
    // Wipe persisted redux state (AsyncStorage) so stale slices can't survive logout/reinstall.
    // Token persistence remains in SecureStore (handled elsewhere).
    try {
      await persistor.purge();
    } catch {
      // ignore
    }
    // Also remove any ride-related manual keys outside redux-persist.
    try {
      await AsyncStorage.removeItem("dismissedBookingId");
    } catch {
      // ignore
    }
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
        void clearCache();
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
      getCurrentUserLastStartRef.current = 0;
      getCurrentUser();
    }
  }, [token, getCurrentUser]);

  const notificationEvent = React.useMemo<TRemoteNotification>(
    () => ({
      title: latest_notification?.title || "",
      body: latest_notification?.message || "",
      data: {
        subType: latest_notification?.event_key,
        screen: latest_notification?.screen,
        rideId: latest_notification?.ride_id || undefined,
        priority:
          latest_notification?.priority === "critical" ||
          latest_notification?.priority === "high" ||
          latest_notification?.priority === "low"
            ? latest_notification.priority
            : "high",
        type: "notification",
      },
    }),
    [latest_notification]
  );

  const global = React.useMemo(
    () => ({
      currentUser,
      apiConfig,
      getCurrentUser,
      apiConfigFormData,
      LogoutUser,
      DeleteUser,
      pusher,
      pusherReady,
      roleLoaded,
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
      pusherReady,
      roleLoaded,
      notificationEvent,
    ]
  );

  return <AppContext.Provider value={global}>{children}</AppContext.Provider>;
}
