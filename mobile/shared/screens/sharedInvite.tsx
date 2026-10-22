import * as Clipboard from "expo-clipboard";

import { AntDesign, Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { horizontalScale, verticalScale } from "@/constants/Metrics";

import React, { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import apiClient from "@/utils/apiClient";
import { inviteShareUrl } from "@/utils/inviteShareUrl";
import { useSelector } from "react-redux";
import { AuthState } from "@/store/AuthSlice";
import {
  inviteConfigFromCache,
  isInviteConfigStale,
  loadInviteCache,
  mergeInviteCache,
  peekInviteCache,
  type InviteCache,
} from "@/utils/inviteCache";

type RewardConfig = {
  reward_type?: string;
  reward_amount?: number;
  successful_invites_required?: number;
  description?: string;
};

function configFromPayload(data: Record<string, unknown> | null | undefined): RewardConfig | null {
  if (!data) return null;
  const hasConfig =
    data.reward_type != null ||
    data.reward_amount != null ||
    data.successful_invites_required != null ||
    (typeof data.description === "string" && data.description.length > 0);
  if (!hasConfig) return null;
  return {
    reward_type: typeof data.reward_type === "string" ? data.reward_type : undefined,
    reward_amount: typeof data.reward_amount === "number" ? data.reward_amount : undefined,
    successful_invites_required:
      typeof data.successful_invites_required === "number"
        ? data.successful_invites_required
        : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
  };
}

function ShimmerBar({ width, height }: { width: number | string; height: number }) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        tw`self-center bg-white/50 rounded-md mt-3`,
        { width, height, opacity },
      ]}
    />
  );
}

const SharedInvite = () => {
  const userId = useSelector(AuthState).user?.profile?.user_id || null;
  const initial = peekInviteCache(userId);
  const initialConfig = inviteConfigFromCache(initial);

  const [referralCode, setReferralCode] = useState<string | null>(initial?.referral_code || null);
  const [referralUrl, setReferralUrl] = useState<string | null>(initial?.referral_url || null);
  const [referralConfig, setReferralConfig] = useState<RewardConfig | null>(initialConfig);
  const [configResolved, setConfigResolved] = useState(!!initialConfig);
  const [codeResolved, setCodeResolved] = useState(!!initial?.referral_code);
  const [refreshing, setRefreshing] = useState(false);
  const [showPullHint, setShowPullHint] = useState(false);
  const generation = useRef(0);

  const applyCache = (cached: InviteCache | null) => {
    if (cached?.referral_code) {
      setReferralCode(cached.referral_code);
      setReferralUrl(cached.referral_url || null);
      setCodeResolved(true);
    }
    const cfg = inviteConfigFromCache(cached);
    if (cfg) {
      // A prize older than 24h is still shown. Opening the screen always revalidates.
      setReferralConfig(cfg);
      setConfigResolved(true);
      return;
    }
    if (cached && !isInviteConfigStale(cached)) setConfigResolved(true);
  };

  const refreshFromNetwork = async (gen: number) => {
    const pull = async () => {
      const { data } = await apiClient.get("user/profile/referral-code");
      return data?.data as Record<string, unknown> | undefined;
    };

    let payload: Record<string, unknown> | undefined;
    let failed = false;
    try {
      payload = await pull();
    } catch {
      try {
        payload = await pull();
      } catch {
        failed = true;
      }
    }
    if (gen !== generation.current) return;

    if (payload) {
      const code = typeof payload.referral_code === "string" ? payload.referral_code.trim() : "";
      if (code) {
        setReferralCode(code);
        setReferralUrl(typeof payload.referral_url === "string" ? payload.referral_url : null);
      }
      const cfg = configFromPayload(payload);
      if (cfg) {
        setReferralConfig(cfg);
        setConfigResolved(true);
      } else {
        setConfigResolved(true);
      }
      setCodeResolved(true);
      setShowPullHint(false);
      if (userId && code) {
        const patch: InviteCache = { referral_code: code };
        if (typeof payload.referral_url === "string" && payload.referral_url) {
          patch.referral_url = payload.referral_url;
        }
        if (cfg) Object.assign(patch, cfg);
        if (payload.updated_at != null) patch.updated_at = String(payload.updated_at);
        await mergeInviteCache(userId, patch, { touchConfig: !!cfg });
      }
      return;
    }

    if (failed) {
      setCodeResolved(true);
      setShowPullHint(true);
    }
  };

  useEffect(() => {
    const gen = ++generation.current;
    let cancelled = false;
    (async () => {
      if (userId) {
        const cached = peekInviteCache(userId) || (await loadInviteCache(userId));
        if (cancelled || gen !== generation.current) return;
        applyCache(cached);
      }
      await refreshFromNetwork(gen);
    })();
    return () => {
      cancelled = true;
    };
    // applyCache and refreshFromNetwork close over the latest userId via this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onPull = async () => {
    const gen = ++generation.current;
    setRefreshing(true);
    try {
      await refreshFromNetwork(gen);
    } finally {
      if (gen === generation.current) setRefreshing(false);
    }
  };

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
    ? `Join me on Keke Ride! Use my invite code ${referralCode} when you sign up. ${inviteShareUrl(referralUrl, referralCode)}`
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

  const blockOnCode = codeResolved && !referralCode;
  const showRewardShimmer = !configResolved && !referralConfig;

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPull}
            tintColor="#ffffff"
          />
        }
      >
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
          {showRewardShimmer ? (
            <ShimmerBar width="86%" height={verticalScale(34)} />
          ) : (
            <Text
              style={tw.style(`text-[30px] mt-2 text-center text-white`, {
                fontFamily: "RobotoBold",
              })}
            >
              {headline}
            </Text>
          )}
          {showRewardShimmer ? (
            <ShimmerBar width="70%" height={verticalScale(18)} />
          ) : (
            <Text
              style={tw.style(`text-[17px] text-center text-white mt-2 px-2`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {description}
            </Text>
          )}
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
            {blockOnCode ? (
              <ActivityIndicator size="small" color={tw.color("base-green")} />
            ) : (
              <Text
                style={tw.style(`text-2xl text-[#242E42]`, {
                  fontFamily: "RobotoRegular",
                })}
                numberOfLines={1}
              >
                {referralCode || "…"}
              </Text>
            )}
            <TouchableOpacity
              onPress={async () => {
                if (referralCode) {
                  await Clipboard.setStringAsync(referralCode);
                  showMessage({
                    type: "info",
                    message: "Invitation code copied to clipboard",
                  });
                }
              }}
              disabled={!referralCode}
            >
              <Feather name="copy" size={24} color={tw.color("base-green")} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onShare}
            style={tw`bg-base-green py-3 rounded`}
            disabled={blockOnCode}
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
        {showPullHint ? (
          <Text
            style={tw.style(`text-center text-[#5C6B7A] mt-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Pull to refresh
          </Text>
        ) : null}
      </ScrollView>
    </ImageBackground>
  );
};

export default SharedInvite;
