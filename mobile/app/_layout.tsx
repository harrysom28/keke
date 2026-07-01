import "react-native-reanimated";
import "@/lib/firebaseMessagingBackground";
import "@/lib/i18n";

import * as SplashScreen from "expo-splash-screen";

import AppStore, { persistor } from "@/store";
import NotificationAlert from "@/components/NotificationAlert";
import NotificationBanner from "@/components/NotificationBanner";
import notificationManager, {
  NotificationPayload,
} from "@/services/notificationManager";
import * as Notifications from "expo-notifications";
import { useNotificationSocket } from "@/hooks/useNotificationSocket";
import { AppContext } from "./context";
import { addIncomingNotification, setLatestNotification, setUnreadCount } from "@/store/AppSlice";
import { setAuthData } from "@/store/AuthSlice";
import { getStoredTokens, setStoredTokens } from "@/utils/secureTokenStorage";
import React, { useContext, useEffect, useRef, useState } from "react";
import * as Device from "expo-device";
import { AppState, LogBox, Platform, type AppStateStatus } from "react-native";

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
import { Stack, useNavigationContainerRef } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { requestManager } from "@/utils/requestManager";
import { pusherManager } from "@/utils/pusherManager";
import { useDispatch, useSelector } from "react-redux";
import { AuthState } from "@/store/AuthSlice";
import { bootstrapI18n } from "@/lib/i18n";
import { isRunningInExpoGo } from "expo";
import * as Sentry from '@sentry/react-native';

// Tracks navigation transactions for performance monitoring in Expo Router.
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.1,
    integrations: [navigationIntegration],
    enableNativeFramesTracking: !isRunningInExpoGo(),
  });
}

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

/** Hide native splash only after persisted state is ready (avoids a blank white screen that looks "stuck"). */
function HideSplashWhenAppMounts() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return null;
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
    import("@/lib/expoNotificationsSetup")
      .then(({ initExpoNotifications }) => initExpoNotifications())
      .catch(() => {});
  }, []);

  // Android 13+: request notification permission once after sign-in so we do not stack
  // an OS dialog on cold launch before the user reaches login/home.
  useEffect(() => {
    if (!token) return;

    (async () => {
      if (
        Platform.OS !== "android" ||
        !Device.osVersion ||
        parseInt(Device.osVersion, 10) < 13
      ) {
        return;
      }
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "undetermined") {
          await Notifications.requestPermissionsAsync();
        }
      } catch {
        // Non-blocking — registerFcmToken retries later.
      }
    })();
  }, [token]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        // Route all foreground deliveries through notificationManager (deduped).
        // OS banners are suppressed in expoNotificationsSetup; FCM onMessage and
        // Expo received can both fire for the same push when both SDKs are linked.
        notificationManager.handle(
          notificationManager.mapExpoNotificationRequestToPayload(
            notification.request
          )
        );
      }
    );
    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        notificationManager.handleNavigation(
          notificationManager.mapExpoNotificationRequestToPayload(
            response.notification.request
          )
        );
      });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
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

  useNotificationSocket(userId, token ?? undefined);

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

function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const splashForceHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loaded, fontError] = useFonts({
    RobotoThin: require("../assets/fonts/Roboto-Thin.ttf"),
    RobotoLight: require("../assets/fonts/Roboto-Light.ttf"),
    RobotoRegular: require("../assets/fonts/Roboto-Regular.ttf"),
    RobotoMedium: require("../assets/fonts/Roboto-Medium.ttf"),
    RobotoBold: require("../assets/fonts/Roboto-Bold.ttf"),
    RobotoBlack: require("../assets/fonts/Roboto-Black.ttf"),
  });

  const fontsReady = loaded || !!fontError;

  useEffect(() => {
    if (navigationRef?.current) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  useEffect(() => {
    bootstrapI18n().catch(() => {});
  }, []);

  // Last-resort: never leave the native splash up if fonts/persist stall on device.
  useEffect(() => {
    splashForceHideRef.current = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 6000);
    return () => {
      if (splashForceHideRef.current) {
        clearTimeout(splashForceHideRef.current);
      }
    };
  }, []);

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

  if (!fontsReady) {
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
                const stored = await Promise.race([
                  getStoredTokens(),
                  new Promise<Awaited<ReturnType<typeof getStoredTokens>>>((resolve) =>
                    setTimeout(
                      () => resolve({ token: null, refreshToken: null }),
                      3000
                    )
                  ),
                ]);
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
              <HideSplashWhenAppMounts />
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

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
