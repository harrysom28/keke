import BottomTabBar from "./_customTab";
import React from "react";
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      initialRouteName="(home)/home"
      screenOptions={{
        headerShown: false,
      }}
      backBehavior="history"
    >
      <Tabs.Screen name="(home)/home" />
      <Tabs.Screen name="offers" />
      <Tabs.Screen name="rides" />
      <Tabs.Screen name="(profile)/profile" />
      <Tabs.Screen name="(profile)/invite" />
      <Tabs.Screen name="(profile)/inviteList" />
      <Tabs.Screen name="(profile)/account" />
      <Tabs.Screen name="(profile)/emergency" />
      <Tabs.Screen name="(profile)/createEmergencyContact" />
      <Tabs.Screen name="(profile)/language" />
      <Tabs.Screen name="(profile)/terms" />
      <Tabs.Screen name="(profile)/contact" />
      <Tabs.Screen name="(profile)/wallet" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
