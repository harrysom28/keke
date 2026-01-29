import { Pressable, Text, View } from "react-native";
import React, { ReactElement } from "react";
import Svg, { Path } from "react-native-svg";

import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import tw from "@/lib/tailwind";

interface ITabs {
  screen: string[];
  icon: (focused: boolean) => ReactElement;
}

const Tabs: ITabs[] = [
  {
    screen: ["Home", "/(home)/home"],
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
    screen: ["Offers", "/offers"],
    icon: (focused) => (
      <Svg width="25" height="24" viewBox="0 0 19 19" fill="none">
        <Path
          d="M12.6284 2.71397C13.7031 2.21002 15.0231 2.40196 15.9108 3.28964C16.7985 4.17732 16.9904 5.49736 16.4865 6.57201C17.6027 6.97555 18.4004 8.04468 18.4004 9.30005C18.4004 10.5554 17.6027 11.6245 16.4865 12.0281C16.9904 13.1027 16.7985 14.4228 15.9108 15.3105C15.0231 16.1981 13.7031 16.3901 12.6284 15.8861C12.2249 17.0024 11.1558 17.8 9.90039 17.8C8.64502 17.8 7.57589 17.0024 7.17235 15.8861C6.0977 16.3901 4.77767 16.1981 3.88998 15.3105C3.0023 14.4228 2.81037 13.1027 3.31431 12.0281C2.19808 11.6245 1.40039 10.5554 1.40039 9.30005C1.40039 8.04468 2.19808 6.97555 3.31431 6.57201C2.81037 5.49736 3.0023 4.17732 3.88998 3.28964C4.77767 2.40196 6.0977 2.21002 7.17235 2.71397C7.57589 1.59774 8.64502 0.800049 9.90039 0.800049C11.1558 0.800049 12.2249 1.59774 12.6284 2.71397Z"
          fill="#C2CCDE"
          fillOpacity="0.25"
        />
        <Path
          d="M6.75578 7.95C6.34306 7.53729 6.34306 6.86814 6.75578 6.45543C7.16849 6.04272 7.83763 6.04272 8.25034 6.45543C8.66306 6.86814 8.66306 7.53729 8.25034 7.95C7.83763 8.36271 7.16849 8.36271 6.75578 7.95Z"
          fill="#C2CCDE"
          fillOpacity="0.25"
        />
        <Path
          d="M10.9406 12.1348C10.5279 11.7221 10.5279 11.0529 10.9406 10.6402C11.3533 10.2275 12.0224 10.2275 12.4351 10.6402C12.8478 11.0529 12.8478 11.7221 12.4351 12.1348C12.0224 12.5475 11.3533 12.5475 10.9406 12.1348Z"
          fill="#C2CCDE"
          fillOpacity="0.25"
        />
        <Path
          d="M12.8088 5.93233L6.23268 12.5084M15.9108 3.28964C15.0231 2.40196 13.7031 2.21002 12.6284 2.71397C12.2249 1.59774 11.1558 0.800049 9.90039 0.800049C8.64502 0.800049 7.57589 1.59774 7.17235 2.71397C6.0977 2.21002 4.77767 2.40196 3.88998 3.28964C3.0023 4.17732 2.81037 5.49736 3.31431 6.57201C2.19808 6.97555 1.40039 8.04468 1.40039 9.30005C1.40039 10.5554 2.19808 11.6245 3.31431 12.0281C2.81037 13.1027 3.0023 14.4228 3.88998 15.3105C4.77767 16.1981 6.0977 16.3901 7.17235 15.8861C7.57589 17.0024 8.64502 17.8 9.90039 17.8C11.1558 17.8 12.2249 17.0024 12.6284 15.8861C13.7031 16.3901 15.0231 16.1981 15.9108 15.3105C16.7985 14.4228 16.9904 13.1027 16.4865 12.0281C17.6027 11.6245 18.4004 10.5554 18.4004 9.30005C18.4004 8.04468 17.6027 6.97555 16.4865 6.57201C16.9904 5.49736 16.7985 4.17732 15.9108 3.28964ZM8.25034 7.95C7.83763 8.36271 7.16849 8.36271 6.75578 7.95C6.34306 7.53729 6.34306 6.86815 6.75578 6.45543C7.16849 6.04272 7.83763 6.04272 8.25034 6.45543C8.66306 6.86814 8.66306 7.53729 8.25034 7.95ZM12.4351 12.1348C12.0224 12.5475 11.3533 12.5475 10.9406 12.1348C10.5279 11.7221 10.5279 11.0529 10.9406 10.6402C11.3533 10.2275 12.0224 10.2275 12.4351 10.6402C12.8478 11.0529 12.8478 11.7221 12.4351 12.1348Z"
          stroke={
            focused ? tw.color("text-white") : tw.color("text-base-green")
          }
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
  {
    screen: ["Rides", "/rides"],
    icon: (focused) => (
      <View>
        <AntDesign
          name="car"
          size={20}
          color={focused ? tw.color("text-white") : tw.color("text-base-green")}
        />
      </View>
    ),
  },
  {
    screen: ["Profile", "/(profile)/profile"],
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
  // state: { key: string; item: ITabs; state: any; index: number };
  currentRouteName: string;
}

const TabItem = ({ item, currentRouteName }: TProps) => {
  const { screen, icon } = item;
  const isFocused = currentRouteName.includes(item.screen[0].toLowerCase());
  const handlePress = () => {
    router.navigate(screen[1] as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={tw`flex-col gap-y-2 basis-[25%] justify-end items-center`}
    >
      <View
        style={tw.style(
          isFocused
            ? `flex-col items-center justify-center h-[52px] w-[52px] bg-base-green rounded-full`
            : `bg-transparent`
        )}
      >
        {icon(isFocused)}
      </View>
      {!isFocused && (
        <Text
          style={tw.style("text-[#484C52", {
            fontSize: 12,
            fontFamily: "RobotoRegular",
          })}
        >
          {screen[0]}
        </Text>
      )}
    </Pressable>
  );
};

const BottomTabBar = ({ state }: any) => {
  // console.log(state.routes[state.index].name);
  return (
    <View
      style={tw.style(
        `flex-row justify-between rounded-t-[33px] items-center bg-white px-4 py-3.5`,
        { elevation: 32 }
      )}
    >
      {Tabs.map((tab, index) => (
        <TabItem
          key={tab.screen[0]}
          item={tab}
          // state={state}
          currentRouteName={state.routes[state.index].name}
        />
      ))}
    </View>
  );
};

export default BottomTabBar;
