/**
 * Register-as screen (Passenger / Driver).
 * For best performance: use compressed register.png & register-bg.png
 * (e.g. WebP or optimized JPEG, @2x/@3x for retina).
 */
import { AuthState, updateRegistration } from "@/store/AuthSlice";
import {
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useCallback, useState } from "react";
import Svg, { Path } from "react-native-svg";
import { WINDOW_HEIGHT, WINDOW_WIDTH } from "@/constants/Metrics";
import { useDispatch, useSelector } from "react-redux";

import tw from "@/lib/tailwind";
import { useRouter } from "expo-router";

interface IUsers {
  title: string;
  text: string;
  svg: () => React.JSX.Element;
  type: "1" | "2";
}

const Users: IUsers[] = [
  {
    title: "Passenger",
    text: "Register as a passenger and locate drivers around you",
    type: "1",
    svg: () => (
      <Svg width="19" height="19" viewBox="0 0 19 19" fill="none">
        <Path
          d="M9.49935 9.50016C11.6855 9.50016 13.4577 7.72796 13.4577 5.54183C13.4577 3.3557 11.6855 1.5835 9.49935 1.5835C7.31322 1.5835 5.54102 3.3557 5.54102 5.54183C5.54102 7.72796 7.31322 9.50016 9.49935 9.50016Z"
          stroke="#3C8F7C"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M16.3 17.4167C16.3 14.3529 13.2521 11.875 9.49963 11.875C5.74713 11.875 2.69922 14.3529 2.69922 17.4167"
          stroke="#3C8F7C"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
  {
    title: "Driver",
    text: "Register as a commercial rider, picking and dropping off passengers across the city",
    type: "2",
    svg: () => (
      <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <Path
          d="M9.5625 11.7548C9.3457 11.7548 9.13377 11.6905 8.95351 11.5701C8.77325 11.4496 8.63275 11.2784 8.54979 11.0781C8.46682 10.8778 8.44512 10.6574 8.48741 10.4448C8.52971 10.2322 8.6341 10.0369 8.78741 9.88355C8.9407 9.73026 9.13602 9.62586 9.34865 9.58356C9.56129 9.54127 9.78169 9.56297 9.98198 9.64594C10.1823 9.7289 10.3535 9.8694 10.4739 10.0497C10.5944 10.2299 10.6587 10.4419 10.6587 10.6587C10.6587 10.9494 10.5432 11.2282 10.3376 11.4337C10.132 11.6393 9.85322 11.7548 9.5625 11.7548ZM19.0625 9.5625C19.0625 11.4414 18.5053 13.2781 17.4615 14.8404C16.4176 16.4027 14.9339 17.6203 13.198 18.3394C11.4621 19.0584 9.55196 19.2465 7.70915 18.88C5.86633 18.5134 4.17359 17.6086 2.84499 16.28C1.51639 14.9514 0.611604 13.2587 0.245044 11.4159C-0.121515 9.57304 0.0666162 7.6629 0.785649 5.92701C1.50468 4.19111 2.72232 2.70741 4.28459 1.66354C5.84685 0.619665 7.68358 0.0625 9.5625 0.0625C12.0812 0.0651598 14.4961 1.0669 16.2771 2.84792C18.0581 4.62894 19.0598 7.04376 19.0625 9.5625ZM1.52404 9.5625V9.59264C3.76853 7.68613 6.61759 6.63942 9.5625 6.63942C12.5074 6.63942 15.3565 7.68613 17.601 9.59264V9.5625C17.601 7.43057 16.7541 5.38595 15.2466 3.87845C13.739 2.37095 11.6944 1.52404 9.5625 1.52404C7.43057 1.52404 5.38596 2.37095 3.87845 3.87845C2.37095 5.38595 1.52404 7.43057 1.52404 9.5625ZM7.68991 17.3799L6.13245 13.2163H2.40371C2.93339 14.2498 3.67987 15.1568 4.59217 15.8753C5.50448 16.5939 6.56111 17.1071 7.68991 17.3799ZM9.5625 17.601H9.78996L11.6233 12.7075C11.7285 12.4291 11.9159 12.1892 12.1606 12.0197C12.4053 11.8502 12.6958 11.7591 12.9935 11.7585H17.2977C17.3324 11.6388 17.3635 11.5173 17.389 11.3931C16.3685 10.3518 15.1504 9.52462 13.8062 8.95992C12.462 8.39521 11.0187 8.10435 9.56068 8.10435C8.10267 8.10435 6.65932 8.39521 5.31512 8.95992C3.97092 9.52462 2.75288 10.3518 1.73231 11.3931C1.76063 11.5155 1.79169 11.637 1.82366 11.7585H6.13245C6.43022 11.7593 6.72071 11.8505 6.96541 12.0202C7.21011 12.1899 7.39747 12.4299 7.50265 12.7085L9.32957 17.601H9.5625ZM16.7213 13.2163H12.9925L11.4314 17.3808C12.561 17.1084 13.6184 16.5953 14.5314 15.8766C15.4444 15.1578 16.1914 14.2504 16.7213 13.2163Z"
          fill="#3C8F7C"
        />
      </Svg>
    ),
  },
];

interface Props {
  item: IUsers;
  isActive: boolean;
  onSelect: (type: IUsers["type"]) => void;
}

const CheckItem = React.memo(({ item, isActive, onSelect }: Props) => {
  return (
    <Pressable
      onPress={() => onSelect(item.type)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive }}
      accessibilityLabel={`${item.title}. ${item.text}`}
      style={tw`flex-row items-center gap-x-4`}
    >
      <Svg width="18" height="19" viewBox="0 0 18 19" fill="none">
        <Path
          d="M9 1.5C6.87827 1.5 4.84344 2.34285 3.34315 3.84315C1.84285 5.34344 1 7.37827 1 9.5C1 11.6217 1.84285 13.6566 3.34315 15.1569C4.84344 16.6571 6.87827 17.5 9 17.5C11.1217 17.5 13.1566 16.6571 14.6569 15.1569C16.1571 13.6566 17 11.6217 17 9.5C17 7.37827 16.1571 5.34344 14.6569 3.84315C13.1566 2.34285 11.1217 1.5 9 1.5Z"
          stroke="#3C8F7C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {isActive && (
          <Path
            d="M9 6.5C8.20435 6.5 7.44129 6.81607 6.87868 7.37868C6.31607 7.94129 6 8.70435 6 9.5C6 10.2956 6.31607 11.0587 6.87868 11.6213C7.44129 12.1839 8.20435 12.5 9 12.5C9.79565 12.5 10.5587 12.1839 11.1213 11.6213C11.6839 11.0587 12 10.2956 12 9.5C12 8.70435 11.6839 7.94129 11.1213 7.37868C10.5587 6.81607 9.79565 6.5 9 6.5Z"
            stroke="#3C8F7C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>

      <View
        style={tw.style(
          `flex-row gap-x-1.5 w-[90%] border border-base-green/[0.29] p-1.5 rounded bg-base-green`,
          isActive ? `bg-opacity-10` : `bg-opacity-0`
        )}
      >
        {item.svg()}
        <View style={tw`w-[90%]`}>
          <Text
            style={tw.style(`text-black text-sm`, {
              fontFamily: "RobotoMedium",
            })}
          >
            {item.title}
          </Text>
          <Text
            style={tw.style(`text-[#5a5a5a] text-[11px]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item.text}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const Register = () => {
  const dispatch = useDispatch();
  const { registration } = useSelector(AuthState);
  const [current, setCurrent] = useState<string>(registration?.type);
  const router = useRouter();

  const handleSelect = useCallback(
    (type: IUsers["type"]) => {
      dispatch(updateRegistration({ type }));
      setCurrent(type);
    },
    [dispatch]
  );

  return (
    <ImageBackground
      source={require("@/assets/images/register-bg.png")}
      resizeMode="cover"
      style={tw.style(`flex-1 flex-col gap-y-6 pb-[90px] text-white bg-white`, {
        width: WINDOW_WIDTH,
      })}
    >
      <StatusBar barStyle="light-content" />

      <View style={tw`overflow-hidden`}>
        <Image
          source={require("@/assets/images/register.png")}
          resizeMode="cover"
          style={tw.style({
            width: WINDOW_WIDTH,
            height: WINDOW_HEIGHT * 0.6,
          })}
          accessibilityIgnoresInvertColors
        />
      </View>

      <View
        style={tw.style(` flex-row  text-white`, {
          width: WINDOW_WIDTH,
        })}
      >
        <View style={tw.style(`flex-col  px-8 w-full`)}>
          <Text
            style={tw.style(`text-[#2a2a2a] text-xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            Register as:
          </Text>

          <View style={tw`flex-col gap-y-4 my-5`}>
            {Users.map((item) => (
              <CheckItem
                key={item.title}
                item={item}
                isActive={item.type === current}
                onSelect={handleSelect}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={tw`flex-col gap-y-5 px-6`}>
        <TouchableOpacity
          onPress={() => router.push("/signup")}
          style={tw`bg-base-green py-4 rounded-[8px]`}
          accessibilityRole="button"
          accessibilityLabel="Continue to sign up"
        >
          <Text
            style={tw.style(`text-white text-base text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

export default Register;
