import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import React, { useContext, useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { AuthState } from "@/store/AuthSlice";
import { updateToken, updateUser } from "@/store/AuthSlice";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { WEB_CLIENT_ID } from "@/constants/Keys";
import { resetSubscription } from "@/store/AppSlice";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { AppContext } from "@/app/context";
import { markInitialDriverRouteHandled } from "@/utils/driverInitialRoute";

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

    if (roleLoaded && user?.profile?.role) {
      console.log(user?.profile?.role, "idx");
      if (user?.profile?.role === "driver") {
        markInitialDriverRouteHandled();
        router.replace("/(driver)/(tabs)/(dashboard)/home");
      } else {
        router.replace("/(app)/(tabs)/(home)/home");
      }
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

  return (
    <View style={tw`flex-1 justify-center items-center`}>
      <ActivityIndicator color={tw.color("base-green")} size="large" />
    </View>
  );
};

export default Index;
