import * as Clipboard from "expo-clipboard";

import { AntDesign, Feather } from "@expo/vector-icons";
import {
  Image,
  ImageBackground,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { horizontalScale, verticalScale } from "@/constants/Metrics";

import { AuthState } from "@/store/AuthSlice";
import React from "react";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";

const SharedInvite = () => {
  const { user } = useSelector(AuthState);

  const onShare = async () => {
    try {
      await Share.share({
        message:
          "React Native | A framework for building native apps using React",
      });
    } catch (error) {
      console.log(error);
      showMessage({
        type: "danger",
        message: "Failed to share",
      });
    }
  };

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View
        style={tw.style(`bg-[#3C8F7CE6] px-4 pt-14`, {
          height: verticalScale(440),
        })}
      >
        <View style={tw`flex-row items-center justify-between w-[70%]`}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={tw`bg-black p-1 rounded-full`}
          >
            <AntDesign name="left" size={24} color="white" />
          </TouchableOpacity>
          <Text
            style={tw.style(`text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            Invite Friends
          </Text>
        </View>
        <Image
          source={require(`@images/gift-box.png`)}
          style={tw.style(`self-center`, {
            height: verticalScale(210),
            width: horizontalScale(376),
          })}
        />
        <Text
          style={tw.style(`text-[30px] mt-2 text-center text-white`, {
            fontFamily: "RobotoBold",
          })}
        >
          Invite Friends Get 3 Coupons each!
        </Text>
        <Text
          style={tw.style(`text-[17px] text-center text-white mt-2`, {
            fontFamily: "RobotoMedium",
          })}
        >
          When your friend sign up wwith your referral code, you'll both get 3.0
          coupons
        </Text>
      </View>
      <View
        style={tw.style(`flex-col gap-y-6 bg-white mx-6 -mt-9 p-5`, {
          elevation: 8,
        })}
      >
        <Text
          style={tw.style(`text-[17px] text-[#242E42]`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Share Your Invite Code
        </Text>
        <View
          style={tw`flex-row justify-between pb-2.5 border-b border-[#242E42]`}
        >
          <Text
            style={tw.style(`text-2xl text-[#242E42]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {user?.profile?.user_id}
          </Text>
          <TouchableOpacity
            onPress={async () => {
              await Clipboard.setStringAsync(user?.profile?.user_id);
              showMessage({
                type: "info",
                message: "Invitation code copied to clipboard",
              });
            }}
          >
            <Feather name="share" size={24} color={tw.color("base-green")} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onShare}
          style={tw`bg-base-green py-3 rounded`}
        >
          <Text
            style={tw.style(`text-[17px] text-center text-white`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Invite Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/(profile)/inviteList`)}
          style={tw`self-center`}
        >
          <Text
            style={tw.style(`text-[17px] text-center text-black`, {
              fontFamily: "RobotoRegular",
            })}
          >
            View invited Friends
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

export default SharedInvite;
