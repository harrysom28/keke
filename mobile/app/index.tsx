import React, { useContext, useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { AuthState } from "@/store/AuthSlice";
import { updateToken, updateUser } from "@/store/AuthSlice";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { WEB_CLIENT_ID } from "@/constants/Keys";
import { resetSubscription } from "@/store/AppSlice";
import { useIsFocused } from "@react-navigation/native";
import { AppContext } from "@/app/context";
import { markInitialDriverRouteHandled } from "@/utils/driverInitialRoute";
import SplashLoading from "@/components/SplashLoading";

const Index = () => {
  const rootNavigationState = useRootNavigationState();
  const isFocused = useIsFocused();
  const dispatch = useDispatch();
  const { token, user } = useSelector(AuthState);
  const { roleLoaded } = useContext(AppContext);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key || !isFocused) {
      return;
    }

    if (!token) {
      router.replace("/(auth)/onboard");
      return;
    }

    // Login/signup often hydrates role before /auth/user/me returns — route immediately.
    if (user?.profile?.role) {
      if (user.profile.role === "driver") {
        markInitialDriverRouteHandled();
        router.replace("/(driver)/(tabs)/(dashboard)/home");
      } else {
        router.replace("/(app)/(tabs)/(home)/home");
      }
      return;
    }

    if (roleLoaded && !user?.profile?.role) {
      dispatch(resetSubscription());
      dispatch(updateUser({ profile: {} }));
      dispatch(updateToken(null));
      router.replace("/(auth)/onboard");
      return;
    }

    const timeout = setTimeout(() => {
      dispatch(resetSubscription());
      dispatch(updateUser({ profile: {} }));
      dispatch(updateToken(null));
      router.replace("/(auth)/onboard");
    }, 15000);

    return () => clearTimeout(timeout);
  }, [dispatch, isFocused, roleLoaded, rootNavigationState?.key, token, user?.profile?.role]);

  return <SplashLoading />;
};

export default Index;
