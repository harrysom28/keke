import "react-native-reanimated";
import "@/lib/i18n";

import * as SplashScreen from "expo-splash-screen";

import AppStore, { persistor } from "@/store";
import NotificationAlert from "@/components/NotificationAlert";
import NotificationBanner from "@/components/NotificationBanner";
import notificationManager, {
  NotificationPayload,
} from "@/services/notificationManager";
import { AppContext } from "./context";
import { addIncomingNotification, setLatestNotification, setUnreadCount } from "@/store/AppSlice";
import { setAuthData } from "@/store/AuthSlice";
import { getStoredTokens, setStoredTokens } from "@/utils/secureTokenStorage";
import React, { useContext, useEffect, useState } from "react";
import { AppState, LogBox, type AppStateStatus } from "react-native";

LogBox.ignoreLogs([
  "Location update failed",
  "Non-serializable values were found in the navigation state",
  "VirtualizedLists should never be nested",
]);

import FlashMessage from "react-native-flash-message";
import apiClient from "@/utils/apiClient";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import GlobalContext from "./context";
import {
  TOAST_COLORS,
  TOAST_STYLE,
  getStatusBarOffset,
} from "@/constants/toastTheme";
import { PersistGate } from "redux-persist/es/integration/react";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalProvider } from "@gorhom/portal";
import { Provider } from "react-redux";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { requestManager } from "@/utils/requestManager";
import { pusherManager } from "@/utils/pusherManager";
import { useDispatch, useSelector } from "react-redux";
import { AuthState } from "@/store/AuthSlice";
import { bootstrapI18n } from "@/lib/i18n";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Suppress non-critical font loading errors from @expo/vector-icons in development
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const errorMessage = args[0]?.toString() || '';
    // Suppress ExpoAsset.downloadAsync errors for vector-icons fonts (non-critical in dev)
    if (
      errorMessage.includes('ExpoAsset.downloadAsync') &&
      errorMessage.includes('@expo/vector-icons')
    ) {
      // Silently ignore - fonts will work in production builds
      return;
    }
    originalError(...args);
  };
}

const Navigation = () => {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(driver)" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
};

const NotificationBootstrap = () => {
  const dispatch = useDispatch();
  const { pusherReady } = useContext(AppContext);
  const { token, user } = useSelector(AuthState);
  const userId = user?.profile?.user_id;
  const [alertPayload, setAlertPayload] = useState<NotificationPayload | null>(
    null
  );
  const [alertVisible, setAlertVisible] = useState(false);
  const [bannerPayload, setBannerPayload] =
    useState<NotificationPayload | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  const syncIncomingNotification = React.useCallback(
    (payload: NotificationPayload) => {
      dispatch(
        addIncomingNotification({
          id: payload.id,
          notification_id: payload.notification_id,
          title: payload.title,
          message: payload.message,
          type: payload.event_key || payload.type,
          priority: payload.priority,
          screen: payload.screen,
          action_type: payload.action_type,
          action_payload: payload.action_payload,
          ride_id: payload.ride_id,
          duration_ms: payload.duration_ms,
          image_url: payload.image_url,
          delivered_at: payload.delivered_at,
          event_key: payload.event_key,
          created_at: payload.delivered_at || new Date().toISOString(),
          related_ride_id: payload.ride_id ?? null,
        })
      );
      dispatch(setLatestNotification(payload));
    },
    [dispatch]
  );

  const fetchUnreadCount = React.useCallback(async () => {
    if (!token) {
      dispatch(setUnreadCount(0));
      return;
    }

    try {
      const { data } = await apiClient.get("notifications/unread-count");
      dispatch(setUnreadCount(Number(data?.data?.count || 0)));
    } catch {
      // Silent: unread sync should never interrupt app flow.
    }
  }, [dispatch, token]);

  useEffect(() => {
    notificationManager.registerAlertHandler((payload) => {
      syncIncomingNotification(payload);
      setAlertPayload(payload);
      setAlertVisible(true);
    });
    notificationManager.registerBannerHandler((payload) => {
      syncIncomingNotification(payload);
      setBannerPayload(payload);
      setBannerVisible(true);
    });
    notificationManager.registerInboxHandler((payload) => {
      syncIncomingNotification(payload);
    });
  }, [syncIncomingNotification]);

  useEffect(() => {
    notificationManager.initFirebaseListeners();
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    notificationManager.registerFcmToken();
  }, [token]);

  // Re-register when returning to foreground (permission/token can change; iOS may rotate FCM token).
  useEffect(() => {
    if (!token) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        notificationManager.registerFcmToken();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    if (!userId || !pusherReady) {
      return;
    }

    notificationManager.initPusherListener(userId);
  }, [pusherReady, userId]);

  useEffect(() => {
    fetchUnreadCount();
    if (!token) {
      return;
    }

    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, token]);

  return (
    <>
      <NotificationBanner
        visible={bannerVisible}
        payload={bannerPayload}
        onDismiss={() => setBannerVisible(false)}
      />
      <NotificationAlert
        visible={alertVisible}
        payload={alertPayload}
        onDismiss={() => setAlertVisible(false)}
        onAction={(payload) => {
          setAlertVisible(false);
          notificationManager.handleNavigation(payload);
        }}
      />
    </>
  );
};

export default function RootLayout() {
  const [loaded] = useFonts({
    RobotoThin: require("../assets/fonts/Roboto-Thin.ttf"),
    RobotoLight: require("../assets/fonts/Roboto-Light.ttf"),
    RobotoRegular: require("../assets/fonts/Roboto-Regular.ttf"),
    RobotoMedium: require("../assets/fonts/Roboto-Medium.ttf"),
    RobotoBold: require("../assets/fonts/Roboto-Bold.ttf"),
    RobotoBlack: require("../assets/fonts/Roboto-Black.ttf"),
  });

  useEffect(() => {
    bootstrapI18n().catch(() => {});
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Apply custom toast colors to match app theme
  useEffect(() => {
    FlashMessage.setColorTheme({
      success: TOAST_COLORS.success,
      danger: TOAST_COLORS.danger,
      warning: TOAST_COLORS.warning,
      info: TOAST_COLORS.info,
    });
  }, []);

  // Global cleanup on unmount
  useEffect(() => {
    return () => {
      if (__DEV__) {
        console.log('🧹 Cleaning up global state on app unmount');
      }
      requestManager.clearAll();
      pusherManager.unsubscribeAll();
    };
  }, []);

  // Optional: Log stats in development
  useEffect(() => {
    if (__DEV__) {
      const interval = setInterval(() => {
        const requestStats = requestManager.getStats();
        const pusherStats = pusherManager.getStats();
        
        if (requestStats.pending > 0 || requestStats.cached > 0 || pusherStats.activeSubscriptions > 0) {
          console.log('📊 Stats:', {
            cachedRequests: requestStats.cached,
            pendingRequests: requestStats.pending,
            activePusherSubs: pusherStats.activeSubscriptions,
          });
        }
      }, 30000); // Log every 30 seconds

      return () => clearInterval(interval);
    }
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Provider store={AppStore}>
            <PersistGate
              persistor={persistor}
              onBeforeLift={async () => {
                const stored = await getStoredTokens();
                const state = AppStore.getState();
                const auth = state?.Auth;
                const fromState =
                  auth && typeof auth === "object"
                    ? {
                        token: (auth as { token?: string | null }).token ?? null,
                        refreshToken: (auth as { refreshToken?: string | null }).refreshToken ?? null,
                      }
                    : { token: null, refreshToken: null };
                if (stored.token || stored.refreshToken) {
                  AppStore.dispatch(
                    setAuthData({
                      token: stored.token ?? null,
                      refreshToken: stored.refreshToken ?? null,
                    })
                  );
                } else if (fromState.token || fromState.refreshToken) {
                  setStoredTokens(fromState);
                }
              }}
            >
              <GlobalContext>
                <BottomSheetModalProvider>
                  <PortalProvider>
                    <Navigation />
                    <NotificationBootstrap />
                  </PortalProvider>
                </BottomSheetModalProvider>
              </GlobalContext>
            </PersistGate>
          </Provider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
      <FlashMessage
        position="top"
        floating
        icon="auto"
        style={{
          ...TOAST_STYLE.container,
          elevation: 1000,
          marginTop: getStatusBarOffset(),
          zIndex: 1000000,
        }}
        duration={3000}
        animationDuration={250}
        titleStyle={TOAST_STYLE.title}
        textStyle={TOAST_STYLE.text}
      />
    </>
  );
}
