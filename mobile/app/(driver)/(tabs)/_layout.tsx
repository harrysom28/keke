import BottomTabBar from "./_customTab";
import React from "react";
import { Tabs } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(dashboard)/home",
};

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      initialRouteName="(dashboard)/home"
      screenOptions={{
        headerShown: false,
      }}
      backBehavior="history"
    >
      <Tabs.Screen name="(dashboard)/home" />
      <Tabs.Screen name="(dashboard)/home-map" />
      <Tabs.Screen name="(profile)/profile" />
      <Tabs.Screen name="(profile)/account" />
      <Tabs.Screen name="(profile)/language" />
      <Tabs.Screen name="(profile)/terms" />
      <Tabs.Screen name="(profile)/contact" />
      <Tabs.Screen name="(profile)/wallet" />
      <Tabs.Screen name="bookings" />
    </Tabs>
  );
}
