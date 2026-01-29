import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import React, { useEffect } from "react";
import { Redirect, router, useRootNavigationState } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { AuthState } from "@/store/AuthSlice";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { WEB_CLIENT_ID } from "@/constants/Keys";
import { resetSubscription } from "@/store/AppSlice";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

const Index = () => {
  const rootNavigationState = useRootNavigationState();
  const isFocused = useIsFocused();
  const dispatch = useDispatch();
  const { token, user } = useSelector(AuthState);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    // dispatch(resetSubscription());
    if (rootNavigationState?.key && isFocused) {
      if (token === null) {
        router.push("/(auth)/onboard");
      } else {
        if (user?.profile?.role) {
          console.log(user?.profile?.role, "idx");
          if (user?.profile?.role === "passenger") {
            router.push("/(app)/(tabs)/(home)/home");
          } else if (user?.profile?.role === "driver") {
            router.push("/(driver)/(tabs)/(dashboard)/home");
          } else {
            router.push("/(app)/(tabs)/(home)/home");
          }
        }
      }
    }
  }, [isFocused, rootNavigationState?.key, token, user?.profile?.role]);

  return (
    <View style={tw`flex-1 justify-center items-center`}>
      <ActivityIndicator color={tw.color("base-green")} size="large" />
    </View>
  );
};

export default Index;
