import "react-native-reanimated";

import * as SplashScreen from "expo-splash-screen";

import AppStore, { persistor } from "@/store";
import React, { useEffect } from "react";

import FlashMessage from "react-native-flash-message";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import GlobalContext from "./context";
import { PersistGate } from "redux-persist/es/integration/react";
import { PortalProvider } from "@gorhom/portal";
import { Provider } from "react-redux";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { useFonts } from "expo-font";
import { requestManager } from "@/utils/requestManager";
import { pusherManager } from "@/utils/pusherManager";

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
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Provider store={AppStore}>
          <PersistGate persistor={persistor}>
            <GlobalContext>
              <PortalProvider>
                <Navigation />
              </PortalProvider>
            </GlobalContext>
          </PersistGate>
        </Provider>
      </GestureHandlerRootView>
      <FlashMessage
        position="top"
        floating
        style={{
          elevation: 1000,
          marginTop: StatusBar.currentHeight,
          zIndex: 1000000,
        }}
        duration={3000}
        titleStyle={{ fontFamily: "RobotoMedium", textAlign: "center" }}
      />
    </>
  );
}
