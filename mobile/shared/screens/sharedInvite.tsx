import * as Clipboard from "expo-clipboard";

import { AntDesign, Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { horizontalScale, verticalScale } from "@/constants/Metrics";

import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import apiClient from "@/utils/apiClient";

const SharedInvite = () => {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [referralConfig, setReferralConfig] = useState<{
    reward_type?: string;
    reward_amount?: number;
    successful_invites_required?: number;
    description?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [codeRes, programRes] = await Promise.all([
          apiClient.get("user/profile/referral-code"),
          apiClient.get("special/offers/referral").catch(() => null),
        ]);
        const codeData = codeRes?.data?.data;
        setReferralCode(codeData?.referral_code || null);
        setReferralUrl(codeData?.referral_url || null);
        if (programRes?.data?.data) {
          const d = programRes.data.data;
          setReferralConfig({
            reward_type: d.reward_type,
            reward_amount: d.reward_amount,
            successful_invites_required: d.successful_invites_required,
            description: d.description,
          });
        }
      } catch (err) {
        showMessage({ type: "danger", message: "Failed to load invite code" });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const rewardLabel =
    referralConfig?.reward_type === "cash"
      ? `₦${referralConfig.reward_amount ?? 500} cash`
      : `₦${referralConfig?.reward_amount ?? 1000} free ride credit`;
  const required = referralConfig?.successful_invites_required ?? 3;
  const headline = `Invite Friends Get ${rewardLabel} each!`;
  const description =
    referralConfig?.description ||
    `When your friend signs up with your referral code and completes their first ride, you'll both get a reward after ${required} successful invites.`;

  const shareMessage = referralCode
    ? `Join me on Keke Ride! Use my invite code ${referralCode} when you sign up. ${referralUrl || ""}`
    : "Join me on Keke Ride - the ride-hailing app!";

  const onShare = async () => {
    try {
      await Share.share({
        message: shareMessage,
        title: "Invite to Keke Ride",
      });
    } catch (error) {
      console.log(error);
      showMessage({
        type: "danger",
        message: "Failed to share",
      });
    }
  };

  const codeToShow = referralCode || (loading ? "…" : "—");
  const copyCode = referralCode || "";

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
          {headline}
        </Text>
        <Text
          style={tw.style(`text-[17px] text-center text-white mt-2 px-2`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {description}
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
          style={tw`flex-row justify-between items-center pb-2.5 border-b border-[#242E42]`}
        >
          {loading ? (
            <ActivityIndicator size="small" color={tw.color("base-green")} />
          ) : (
            <Text
              style={tw.style(`text-2xl text-[#242E42]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={1}
            >
              {codeToShow}
            </Text>
          )}
          <TouchableOpacity
            onPress={async () => {
              if (copyCode) {
                await Clipboard.setStringAsync(copyCode);
                showMessage({
                  type: "info",
                  message: "Invitation code copied to clipboard",
                });
              }
            }}
            disabled={!copyCode}
          >
            <Feather name="copy" size={24} color={tw.color("base-green")} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onShare}
          style={tw`bg-base-green py-3 rounded`}
          disabled={loading}
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
