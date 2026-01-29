import { ClipPath, Defs, G, Mask, Path, Rect, Svg } from "react-native-svg";
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AntDesign } from "@expo/vector-icons";
import React from "react";
import tw from "@/lib/tailwind";

interface TProps {
  text: string;
  action: () => void;
  exclude?: boolean;
}

const TapItem = ({ text, action, exclude = false }: TProps) => {
  return (
    <TouchableOpacity
      onPress={action}
      style={tw.style(
        `flex-row items-center justify-between py-3.5`,
        !exclude && `border-b border-[#EFEFF4]`
      )}
    >
      <Text
        style={tw.style(`text-[17px]`, {
          fontFamily: "RobotoRegular",
        })}
      >
        {text}
      </Text>
      <AntDesign name="right" size={16} color="#00000040" />
    </TouchableOpacity>
  );
};

const ProfileScreen = () => {
  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View
        style={tw`bg-[#3C8F7CE6] h-[115px] flex-col items-center justify-end py-5`}
      >
        <Text
          style={tw.style(`text-center text-white text-2xl`, {
            fontFamily: "RobotoBold",
          })}
        >
          User Profile
        </Text>
      </View>

      <ScrollView style={tw`flex-1 px-6`} contentContainerStyle={tw`pb-8`}>
        <View style={tw`flex-row items-center justify-between my-3.5`}>
          <View style={tw`flex-row items-center gap-x-2.5`}>
            <Image
              source={{ uri: "https://picsum.photos/200/300" }}
              style={tw`w-[56px] h-[56px] rounded-full`}
            />
            <View>
              <Text style={tw.style(`text-lg`, { fontFamily: "RobotoBold" })}>
                Hello Windy,
              </Text>
              <Text
                style={tw.style(`text-sm text-[#8F92A1]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Your available balance
              </Text>
            </View>
          </View>
          <Text style={tw.style(`text-2xl`, { fontFamily: "RobotoBold" })}>
            ₦15,901
          </Text>
        </View>

        <View style={tw`py-4 flex-row bg-base-green rounded-[20px]`}>
          <TouchableOpacity
            style={tw`flex-col items-center w-[50%] border-r-[0.5px] border-white`}
          >
            <Svg width="37" height="37" viewBox="0 0 37 37" fill="none">
              <G clip-path="url(#clip0_271_25478)">
                <Path
                  d="M29.1366 7.1709H7.58853C5.3963 7.1709 3.61914 8.94805 3.61914 11.1403V25.8837C3.61914 28.076 5.3963 29.8531 7.58853 29.8531H29.1366C31.3289 29.8531 33.106 28.076 33.106 25.8837V11.1403C33.106 8.94805 31.3289 7.1709 29.1366 7.1709Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d="M3.24023 13.9756H32.7271"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <Mask
                  id="path-3-outside-1_271_25478"
                  maskUnits="userSpaceOnUse"
                  x="27.3262"
                  y="24.0728"
                  width="12"
                  height="12"
                  fill="black"
                >
                  <Rect
                    fill="white"
                    x="27.3262"
                    y="24.0728"
                    width="12"
                    height="12"
                  />
                  <Path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M34.2407 26.0728H31.9724V28.719H29.3262V30.9872H31.9724V33.6335H34.2407V30.9872H36.8869V28.719H34.2407V26.0728Z"
                  />
                </Mask>
                <Path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M34.2407 26.0728H31.9724V28.719H29.3262V30.9872H31.9724V33.6335H34.2407V30.9872H36.8869V28.719H34.2407V26.0728Z"
                  fill="white"
                />
                <Path
                  d="M31.9724 26.0728V24.0728H29.9724V26.0728H31.9724ZM34.2407 26.0728H36.2407V24.0728H34.2407V26.0728ZM31.9724 28.719V30.719H33.9724V28.719H31.9724ZM29.3262 28.719V26.719H27.3262V28.719H29.3262ZM29.3262 30.9872H27.3262V32.9872H29.3262V30.9872ZM31.9724 30.9872H33.9724V28.9872H31.9724V30.9872ZM31.9724 33.6335H29.9724V35.6335H31.9724V33.6335ZM34.2407 33.6335V35.6335H36.2407V33.6335H34.2407ZM34.2407 30.9872V28.9872H32.2407V30.9872H34.2407ZM36.8869 30.9872V32.9872H38.8869V30.9872H36.8869ZM36.8869 28.719H38.8869V26.719H36.8869V28.719ZM34.2407 28.719H32.2407V30.719H34.2407V28.719ZM31.9724 28.0728H34.2407V24.0728H31.9724V28.0728ZM33.9724 28.719V26.0728H29.9724V28.719H33.9724ZM29.3262 30.719H31.9724V26.719H29.3262V30.719ZM31.3262 30.9872V28.719H27.3262V30.9872H31.3262ZM31.9724 28.9872H29.3262V32.9872H31.9724V28.9872ZM33.9724 33.6335V30.9872H29.9724V33.6335H33.9724ZM34.2407 31.6335H31.9724V35.6335H34.2407V31.6335ZM32.2407 30.9872V33.6335H36.2407V30.9872H32.2407ZM36.8869 28.9872H34.2407V32.9872H36.8869V28.9872ZM34.8869 28.719V30.9872H38.8869V28.719H34.8869ZM34.2407 30.719H36.8869V26.719H34.2407V30.719ZM32.2407 26.0728V28.719H36.2407V26.0728H32.2407Z"
                  fill="#3C8F7C"
                  mask="url(#path-3-outside-1_271_25478)"
                />
                <Path
                  d="M12.6914 21.6309H9.28906V23.0485H12.6914V21.6309Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </G>
              <Defs>
                <ClipPath id="clip0_271_25478">
                  <Rect
                    width="36.2915"
                    height="36.2915"
                    fill="white"
                    transform="translate(0.216797 0.366211)"
                  />
                </ClipPath>
              </Defs>
            </Svg>

            <Text
              style={tw.style(`text-white text-sm text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Top Up
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-col items-center w-[50%] border-l-[0.5px] border-white`}
          >
            <Svg width="37" height="37" viewBox="0 0 37 37" fill="none">
              <Path
                d="M18.6406 12.4634V19.268L24.6892 21.5363"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M6.4082 18.5119C6.4082 15.5777 7.43152 12.7353 9.30188 10.4744C11.1722 8.21356 13.7725 6.67576 16.6548 6.12593C19.537 5.57611 22.5208 6.0487 25.0921 7.46228C27.6634 8.87586 29.6612 11.1419 30.7414 13.8701C31.8216 16.5983 31.9164 19.6178 31.0097 22.4084C30.103 25.199 28.2514 27.5861 25.774 29.1583C23.2965 30.7306 20.3483 31.3896 17.4372 31.0218C14.5261 30.6541 11.8344 29.2826 9.82573 27.1436"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <Path
                d="M9.56641 16.9998L6.54211 20.0241L3.51782 16.9998"
                fill="white"
              />
              <Path
                d="M9.56641 16.9998L6.54211 20.0241L3.51782 16.9998L9.56641 16.9998Z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>

            <Text
              style={tw.style(`text-white text-sm text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              History
            </Text>
          </TouchableOpacity>
        </View>

        <View style={tw`my-2`}>
          <TapItem text="Account Settings" action={() => {}} />
          <TapItem text="Language" action={() => {}} />
          <TapItem text="Invite a Friend" action={() => {}} />
          <TapItem text="Emergency Contact" action={() => {}} exclude />
        </View>

        <View style={tw`my-2`}>
          <TapItem text="Clear cache" action={() => {}} />
          <TapItem text="Terms & Privacy Policy" action={() => {}} />
          <TapItem text="Contact us" action={() => {}} exclude />
        </View>

      </ScrollView>
    </ImageBackground>
  );
};

export default ProfileScreen;
