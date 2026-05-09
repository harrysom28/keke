import { Platform, Pressable, Text, View } from "react-native";
import React, { ReactElement } from "react";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import { router } from "expo-router";
import { AppDetailsState } from "@/store/AppSlice";
import tw from "@/lib/tailwind";

interface ITabs {
  routeMatch: string;
  path: string;
  labelKey:
    | "driver_tabs.home"
    | "driver_tabs.bookings"
    | "driver_tabs.tasks"
    | "driver_tabs.profile";
  icon: (focused: boolean) => ReactElement;
}

const DRIVER_TAB_ITEMS: ITabs[] = [
  {
    routeMatch: "home",
    path: "/(dashboard)/home",
    labelKey: "driver_tabs.home",
    icon: (focused) => (
      <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
        <Path
          d="M9.52 2.84004L4.13 7.04004C3.23 7.74004 2.5 9.23004 2.5 10.36V17.77C2.5 20.09 4.39 21.99 6.71 21.99H18.29C20.61 21.99 22.5 20.09 22.5 17.78V10.5C22.5 9.29004 21.69 7.74004 20.7 7.05004L14.52 2.72004C13.12 1.74004 10.87 1.79004 9.52 2.84004Z"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M12.5 17.99V14.99"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
  {
    routeMatch: "bookings",
    path: "/bookings",
    labelKey: "driver_tabs.bookings",
    icon: (focused) => (
      <Svg width={25} height={24} viewBox="0 0 23 22" fill="none">
        <Path
          d="M8.59961 19H5.59961C4.53874 19 3.52133 18.5786 2.77118 17.8284C2.02104 17.0783 1.59961 16.0609 1.59961 15V6C1.59961 4.93913 2.02104 3.92172 2.77118 3.17157C3.52133 2.42143 4.53874 2 5.59961 2H16.5996C17.6605 2 18.6779 2.42143 19.428 3.17157C20.1782 3.92172 20.5996 4.93913 20.5996 6V9M7.59961 1V3M14.5996 1V3M1.59961 7H20.5996M18.0996 14.643L16.5996 16.143"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeOpacity={0.79}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M16.5996 21C19.361 21 21.5996 18.7614 21.5996 16C21.5996 13.2386 19.361 11 16.5996 11C13.8382 11 11.5996 13.2386 11.5996 16C11.5996 18.7614 13.8382 21 16.5996 21Z"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeOpacity={0.79}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
  {
    routeMatch: "tasks",
    path: "/tasks",
    labelKey: "driver_tabs.tasks",
    icon: (focused) => (
      <Svg width={25} height={24} viewBox="0 0 33 32" fill="none">
        <Path
          d="M14.8672 20.1801L11.2772 16.5901L9.86719 18.0001L14.8672 23.0001L23.8672 14.0001L22.4572 12.5801L14.8672 20.1801Z"
          fill={focused ? tw.color("text-white") : tw.color("text-base-green")}
          fillOpacity={0.7}
        />
        <Path
          d="M25.8672 5H22.8672V4C22.8672 3.46957 22.6565 2.96086 22.2814 2.58579C21.9063 2.21071 21.3976 2 20.8672 2H12.8672C12.3368 2 11.828 2.21071 11.453 2.58579C11.0779 2.96086 10.8672 3.46957 10.8672 4V5H7.86719C7.33675 5 6.82805 5.21071 6.45297 5.58579C6.0779 5.96086 5.86719 6.46957 5.86719 7V28C5.86719 28.5304 6.0779 29.0391 6.45297 29.4142C6.82805 29.7893 7.33675 30 7.86719 30H25.8672C26.3976 30 26.9063 29.7893 27.2814 29.4142C27.6565 29.0391 27.8672 28.5304 27.8672 28V7C27.8672 6.46957 27.6565 5.96086 27.2814 5.58579C26.9063 5.21071 26.3976 5 25.8672 5ZM12.8672 4H20.8672V8H12.8672V4ZM25.8672 28H7.86719V7H10.8672V10H22.8672V7H25.8672V28Z"
          fill={focused ? tw.color("text-white") : tw.color("text-base-green")}
          fillOpacity={0.7}
        />
      </Svg>
    ),
  },
  {
    routeMatch: "profile",
    path: "/(profile)/profile",
    labelKey: "driver_tabs.profile",
    icon: (focused) => (
      <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
        <Path
          d="M12.5 12C15.2614 12 17.5 9.76142 17.5 7C17.5 4.23858 15.2614 2 12.5 2C9.73858 2 7.5 4.23858 7.5 7C7.5 9.76142 9.73858 12 12.5 12Z"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M21.0901 22C21.0901 18.13 17.2402 15 12.5002 15C7.76015 15 3.91016 18.13 3.91016 22"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
];

interface TProps {
  item: ITabs;
  currentRouteName: string;
  showOfferBadge?: boolean;
}

const TabItem = ({ item, currentRouteName, showOfferBadge }: TProps) => {
  const { t } = useTranslation();
  const { path, icon, routeMatch, labelKey } = item;
  const isFocused = currentRouteName.toLowerCase().includes(routeMatch);
  const handlePress = () => {
    router.navigate(path as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={tw`flex-col gap-y-2 basis-[25%] justify-end items-center`}
    >
      <View
        style={tw.style(
          `relative`,
          isFocused
            ? `flex-col items-center justify-center bg-base-green rounded-full`
            : `bg-transparent`,
          isFocused ? { width: 52, height: 52 } : {}
        )}
      >
        {icon(isFocused)}
        {showOfferBadge ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: "#FF3B30",
              borderWidth: 2,
              borderColor: "#fff",
            }}
          />
        ) : null}
      </View>
      {!isFocused && (
        <Text
          style={tw.style("text-[#484C52]", {
            fontSize: 12,
            fontFamily: "RobotoRegular",
          })}
        >
          {t(labelKey, { defaultValue: routeMatch })}
        </Text>
      )}
    </Pressable>
  );
};

const BottomTabBar = ({
  state,
}: {
  state?: { routes: { name: string }[]; index: number };
}) => {
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { driverPendingRideOffer } = useSelector(AppDetailsState);
  const routeName = state?.routes?.[state?.index ?? 0]?.name ?? "";
  if (!state?.routes?.length) {
    return null;
  }
  return (
    <View
      key={i18n.language ?? "en"}
      style={tw.style(`bg-white`, { elevation: 32 })}
    >
      <View
        style={[
          tw.style(
            `flex-row justify-between rounded-t-[33px] items-end px-4 pt-2.5`
          ),
          {
            paddingBottom:
              insets.bottom > 0
                ? insets.bottom
                : Platform.OS === "android"
                ? 20
                : 12,
            minHeight: 64,
          },
        ]}
      >
        {DRIVER_TAB_ITEMS.map((tab) => (
          <TabItem
            key={tab.routeMatch}
            item={tab}
            currentRouteName={routeName}
            showOfferBadge={
              tab.routeMatch === "home" && Boolean(driverPendingRideOffer)
            }
          />
        ))}
      </View>
    </View>
  );
};

export default BottomTabBar;
