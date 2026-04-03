import * as Clipboard from "expo-clipboard";

import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Svg,
} from "react-native-svg";
import { Entypo, MaterialCommunityIcons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { AppContext } from "@/app/context";
import EmptyData from "@/components/emptyData";
import apiClient from "@/utils/apiClient";
import { Portal } from "@gorhom/portal";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useFocusRefresh } from "@/hooks/useFocusRefresh";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthState } from "@/store/AuthSlice";
import { useSelector } from "react-redux";
import { router } from "expo-router";

function getRandomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

interface ICurrent {
  title: string;
  text: string;
  code: string;
  discount_type?: string;
  discount_value?: number;
  max_discount?: number;
  min_amount?: number;
  valid_from?: string;
  valid_to?: string;
  applicable_vehicle_types?: Array<{ name: string; display_name: string }>;
}

interface LProps {
  item: {
    offer_title: string;
    description: string;
    offer_id: string;
    code?: string;
    discount_type?: string;
    discount_value?: number;
    max_discount?: number;
    min_amount?: number;
    valid_from?: string;
    valid_to?: string;
    applicable_vehicle_types?: Array<{ name: string; display_name: string }>;
  };
  index: number;
  showModal: (item: ICurrent) => void;
}

const ListItem = ({ item, index, showModal }: LProps) => {
  const num = getRandomNumber();
  const renderColor = () => {
    switch (num) {
      case 1:
        return "#E53935";
      case 2:
        return "#388E3D";
      case 3:
        return "#3C8F7C";
      case 4:
        return "#752CD1";
    }
  };

  const formatDiscount = () => {
    if (!item.discount_type || !item.discount_value) return "";
    if (item.discount_type === "percentage") {
      return `${item.discount_value}% OFF`;
    } else {
      return `₦${item.discount_value} OFF`;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const isExpiringSoon = () => {
    if (!item.valid_to) return false;
    try {
      const expiryDate = new Date(item.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
    } catch {
      return false;
    }
  };

  return (
    <Pressable
      onPress={() =>
        showModal({
          title: item?.offer_title || item?.code || "Special Offer",
          text: item?.description || "No description available",
          code: item?.code || item?.offer_id || "",
          discount_type: item?.discount_type,
          discount_value: item?.discount_value,
          max_discount: item?.max_discount,
          min_amount: item?.min_amount,
          valid_from: item?.valid_from,
          valid_to: item?.valid_to,
          applicable_vehicle_types: item?.applicable_vehicle_types,
        })
      }
      style={tw.style(
        `flex-row items-center gap-x-2.5 px-3 py-3 bg-white rounded-[8px] border border-base-green`
      )}
    >
      <View
        style={tw`flex-col items-center justify-center bg-[#3C8F7C78] h-[50px] w-[50px] border border-base-green rounded-full`}
      >
        <Svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          <G clip-path="url(#clip0_1148_3617)">
            <Path
              d="M24.1628 7.10757C24.1567 6.83113 23.9309 6.61017 23.6544 6.61017H6.34442C6.06792 6.61017 5.84204 6.83118 5.83606 7.10757L5.34973 29.4804C5.34347 29.7655 5.57286 30 5.85809 30H24.1408C24.4259 30 24.6554 29.7655 24.6492 29.4804L24.1628 7.10757Z"
              fill={renderColor()}
            />
            <Path
              d="M14.0943 27.9661C10.9576 27.9661 8.43417 25.3871 8.50237 22.2512L8.84239 6.61011H6.34442C6.06786 6.61011 5.84204 6.83112 5.83606 7.10751L5.34973 29.4804C5.34352 29.7655 5.57292 30 5.85815 30H24.1409C24.426 30 24.6554 29.7655 24.6492 29.4804L24.6163 27.9661H14.0943Z"
              fill={renderColor()}
            />
            <Path
              d="M11.4411 10.9322C12.1432 10.9322 12.7123 10.363 12.7123 9.66096C12.7123 8.9589 12.1432 8.38977 11.4411 8.38977C10.7391 8.38977 10.1699 8.9589 10.1699 9.66096C10.1699 10.363 10.7391 10.9322 11.4411 10.9322Z"
              fill={renderColor()}
            />
            <Path
              d="M18.5583 10.9322C19.2604 10.9322 19.8295 10.363 19.8295 9.66096C19.8295 8.9589 19.2604 8.38977 18.5583 8.38977C17.8562 8.38977 17.2871 8.9589 17.2871 9.66096C17.2871 10.363 17.8562 10.9322 18.5583 10.9322Z"
              fill={renderColor()}
            />
            <Path
              d="M10.4227 24.5339C10.2598 24.5339 10.0974 24.4718 9.97331 24.3477C9.72504 24.0995 9.72504 23.6973 9.97331 23.4489L19.1258 14.2964C19.3741 14.0482 19.7763 14.0482 20.0246 14.2964C20.2729 14.5447 20.2729 14.9469 20.0246 15.1952L10.8721 24.3477C10.7479 24.4718 10.5855 24.5339 10.4227 24.5339Z"
              fill="white"
            />
            <Path
              d="M11.9488 18.9407C10.477 18.9407 9.2793 17.743 9.2793 16.2712C9.2793 14.7995 10.477 13.6017 11.9488 13.6017C13.4205 13.6017 14.6182 14.7995 14.6182 16.2712C14.6182 17.743 13.4206 18.9407 11.9488 18.9407ZM11.9488 14.8729C11.1776 14.8729 10.5505 15.5001 10.5505 16.2712C10.5505 17.0424 11.1776 17.6695 11.9488 17.6695C12.7199 17.6695 13.3471 17.0424 13.3471 16.2712C13.3471 15.5001 12.7199 14.8729 11.9488 14.8729Z"
              fill="white"
            />
            <Path
              d="M18.0503 25.0424C16.5786 25.0424 15.3809 23.8447 15.3809 22.3729C15.3809 20.9011 16.5786 19.7034 18.0503 19.7034C19.5221 19.7034 20.7198 20.9011 20.7198 22.3729C20.7198 23.8447 19.5221 25.0424 18.0503 25.0424ZM18.0503 20.9746C17.2792 20.9746 16.6521 21.6017 16.6521 22.3728C16.6521 23.144 17.2792 23.7711 18.0503 23.7711C18.8215 23.7711 19.4486 23.144 19.4486 22.3728C19.4486 21.6017 18.8215 20.9746 18.0503 20.9746Z"
              fill="white"
            />
            <Path
              d="M18.5588 10.1695C18.2777 10.1695 18.0503 9.94207 18.0503 9.661V4.06781C18.0503 2.38547 16.6818 1.01695 14.9995 1.01695C13.3171 1.01695 11.9486 2.38547 11.9486 4.06781V9.66105C11.9486 9.94213 11.7212 10.1695 11.4401 10.1695C11.159 10.1695 10.9316 9.94213 10.9316 9.66105V4.06781C10.9316 1.82484 12.7565 0 14.9995 0C17.2424 0 19.0673 1.82484 19.0673 4.06781V9.66105C19.0673 9.94207 18.8399 10.1695 18.5588 10.1695Z"
              fill="#2A2A2A"
            />
            <Path
              d="M11.4401 10.1695C11.1593 10.1695 10.9316 9.94177 10.9316 9.66099V8.64404C10.9316 8.36325 11.1593 8.13556 11.4401 8.13556C11.7209 8.13556 11.9486 8.36325 11.9486 8.64404V9.66099C11.9486 9.94183 11.721 10.1695 11.4401 10.1695Z"
              fill="#FCE2E7"
            />
            <Path
              d="M18.5593 10.1695C18.2785 10.1695 18.0508 9.94177 18.0508 9.66099V8.64404C18.0508 8.36325 18.2785 8.13556 18.5593 8.13556C18.84 8.13556 19.0677 8.36325 19.0677 8.64404V9.66099C19.0677 9.94183 18.84 10.1695 18.5593 10.1695Z"
              fill="#FCE2E7"
            />
          </G>
          <Defs>
            <ClipPath id="clip0_1148_3617">
              <Rect width="30" height="30" fill="white" />
            </ClipPath>
          </Defs>
        </Svg>
      </View>

      <View style={tw`basis-[89.5%]`}>
        <View style={tw`flex-row justify-between items-start`}>
          <View style={tw`flex-1`}>
            <Text
              style={tw.style(`text-base text-black`, {
                fontFamily: "RobotoBold",
              })}
              numberOfLines={1}
            >
              {item?.offer_title || item?.code || "Special Offer"}
            </Text>
            {item?.discount_type && item?.discount_value && (
              <View style={tw`flex-row items-center gap-x-2 mt-1`}>
                <View
                  style={tw`bg-base-green px-2 py-0.5 rounded`}
                >
                  <Text
                    style={tw.style(`text-xs text-white`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {formatDiscount()}
                  </Text>
                </View>
                {isExpiringSoon() && (
                  <View
                    style={tw`bg-red-100 px-2 py-0.5 rounded`}
                  >
                    <Text
                      style={tw.style(`text-xs text-red-700`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Expires Soon
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
        <Text
          numberOfLines={2}
          style={tw.style(`text-xs text-[#B8B8B8] w-[90%] mt-1`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {item?.description || "No description available"}
        </Text>
        {item?.valid_to && (
          <Text
            style={tw.style(`text-xs text-[#8F92A1] mt-1`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Valid until {formatDate(item.valid_to)}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

const List = [
  "Eligibility: Valid only for rides booked through the Keke app.",
  "Expiration: Must be used before the expiration date indicated.",
  "Refunds: Forfeited if canceled by the user; reactivated if canceled by Keke.",
  "Misuse: Misuse leads to cancellation and potential account suspension.",
];

export interface MilestoneOffer {
  available: boolean;
  completed_rides: number;
  target_rides: number;
  reward_amount: number;
  claimed: boolean;
  rides_remaining: number;
  can_claim: boolean;
  message: string;
}

export interface ReferralOffer {
  available: boolean;
  enabled: boolean;
  referral_code?: string;
  reward_type: "cash" | "free_ride";
  reward_amount: number;
  successful_invites_required: number;
  successful_invites: number;
  claimed_count: number;
  can_claim: boolean;
  claimed: boolean;
  message: string;
  description?: string;
}

const OffersScreen = () => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const refreshOnFocus = useFocusRefresh(60_000);
  const { token } = useSelector(AuthState);
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const [data, setData] = useState([]);
  const [milestone, setMilestone] = useState<MilestoneOffer | null>(null);
  const [referral, setReferral] = useState<ReferralOffer | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimingReferral, setClaimingReferral] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState<ICurrent>({
    title: "",
    text: "",
    code: "",
  });

  const showModal = (item: ICurrent) => {
    setCurrent(item);
    bottomSheetRef?.current?.open();
    // setShow(true);
  };

  // const renderBackdrop = useCallback(
  //   (props: BottomSheetBackdropProps) => (
  //     <BottomSheetBackdrop
  //       {...props}
  //       disappearsOnIndex={-1}
  //       appearsOnIndex={0}
  //       style={[
  //         { backgroundColor: "#1919194D" },
  //         StyleSheet.absoluteFillObject,
  //       ]}
  //     />
  //   ),
  //   []
  // );

  const claimMilestone = () => {
    if (!milestone?.can_claim || claiming) return;
    setClaiming(true);
    apiClient
      .post("special/offers/milestone/claim")
      .then(({ data: res }) => {
        const msg = res?.data?.message || "₦1,000 added to your wallet!";
        showMessage({ type: "success", message: msg });
        setMilestone((m) => m ? { ...m, claimed: true, can_claim: false, message: "You've claimed your free ₦1,000 ride!" } : null);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || err?.message || "Could not claim reward.";
        showMessage({ type: "danger", message: msg });
      })
      .finally(() => setClaiming(false));
  };

  const claimReferral = () => {
    if (!referral?.can_claim || claimingReferral) return;
    setClaimingReferral(true);
    apiClient
      .post("special/offers/referral/claim")
      .then(({ data: res }) => {
        const msg = res?.data?.message || "Reward added to your wallet!";
        showMessage({ type: "success", message: msg });
        setReferral((r) => r ? { ...r, can_claim: false, claimed_count: (r.claimed_count || 0) + 1, claimed: true } : null);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || err?.message || "Could not claim reward.";
        showMessage({ type: "danger", message: msg });
      })
      .finally(() => setClaimingReferral(false));
  };

  const getOffers = (): Promise<void> => {
    if (!token) {
      setData([]);
      setMilestone(null);
      setReferral(null);
      return Promise.resolve();
    }

    setLoading(true);
    return Promise.all([
      apiClient.get("special/offers"),
      apiClient.get("special/offers/milestone"),
      apiClient.get("special/offers/referral").catch(() => null),
    ])
      .then(([offersRes, milestoneRes, referralRes]) => {
        const offers = offersRes?.data?.data?.offers ?? offersRes?.data?.data ?? [];
        const transformedData = (Array.isArray(offers) ? offers : []).map((offer: any) => ({
          ...offer,
          offer_title: offer.code || offer.offer_title || "Special Offer",
          offer_id: offer.promo_id || offer.code || offer.offer_id || "",
          description: offer.description || "No description available",
          code: offer.code || offer.offer_id || "",
          discount_type: offer.discount_type,
          discount_value: offer.discount_value,
          max_discount: offer.max_discount,
          min_amount: offer.min_amount,
          valid_from: offer.valid_from,
          valid_to: offer.valid_to,
          applicable_vehicle_types: offer.applicable_vehicle_types || [],
        }));
        setData(transformedData);
        const d = milestoneRes?.data?.data;
        if (d) setMilestone(d);
        else setMilestone(null);
        const refD = referralRes?.data?.data;
        if (refD) setReferral(refD);
        else setReferral(null);
        if (d?.available && !d?.claimed && d?.rides_remaining >= 1 && d?.rides_remaining <= 3) {
          showMessage({
            type: "info",
            message: d.rides_remaining === 1 ? "1 more ride to unlock your free ₦1,000!" : `${d.rides_remaining} more rides to unlock your free ₦1,000!`,
            duration: 4000,
          });
        }
      })
      .catch((err) => {
        if (err?.response?.status !== 401) {
          const msg = err?.response?.data?.message;
          if (msg) showMessage({ type: "danger", message: msg });
        }
        setData([]);
        setMilestone(null);
        setReferral(null);
      })
      .finally(() => setLoading(false)) as Promise<void>;
  };

  useEffect(() => {
    refreshOnFocus(() => {
      getOffers();
    });
  }, [isFocused, token, refreshOnFocus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await getOffers();
    setRefreshing(false);
  };

  const progress = milestone?.target_rides
    ? Math.min(1, (milestone.completed_rides ?? 0) / milestone.target_rides)
    : 0;

  const topInset = Math.max(insets.top, StatusBar.currentHeight ?? 0, 44);
  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
        paddingTop: topInset + 12,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar
        translucent
        barStyle="dark-content"
        backgroundColor={"transparent"}
      />
      <Text
        style={tw.style(`text-2xl text-center text-[#2A2A2A] my-4`, {
          fontFamily: "RobotoBold",
        })}
      >
        Special Offers
      </Text>

      {loading && !refreshing ? (
        <View style={tw`flex-1 justify-center items-center`}>
          <ActivityIndicator color={tw.color("base-green")} size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item?.offer_id ?? item?.code ?? String(Math.random())}
          contentContainerStyle={tw`flex-col gap-y-3 pb-16 px-6`}
          ListHeaderComponent={
            <>
            {referral?.available && referral?.enabled ? (
              <View style={tw`mb-4 mt-1`}>
                <View
                  style={tw.style(
                    `rounded-2xl overflow-hidden px-4 py-4 border-2 bg-white border-[#3C8F7C]`
                  )}
                >
                  <View style={tw`flex-row items-start gap-2 mb-2`}>
                    <View style={tw`w-10 h-10 rounded-full bg-[#3C8F7C] items-center justify-center flex-shrink-0`}>
                      <MaterialCommunityIcons name="account-multiple-plus-outline" size={22} color="white" />
                    </View>
                    <View style={tw`flex-1 min-w-0`}>
                      <Text style={tw.style(`text-lg text-[#2A2A2A]`, { fontFamily: "RobotoBold" })}>
                        Invite Friends – {referral.reward_type === "cash" ? `₦${referral.reward_amount} cash` : `₦${referral.reward_amount} free ride`}
                      </Text>
                    </View>
                  </View>
                  <Text style={tw.style(`text-sm text-[#555] mb-3`, { fontFamily: "RobotoRegular" })}>
                    {referral.message}
                  </Text>
                  <View style={tw`h-2 bg-gray-200 rounded-full overflow-hidden mb-2`}>
                    <View
                      style={[
                        tw`h-full rounded-full`,
                        { width: `${Math.min(100, ((referral.successful_invites || 0) / (referral.successful_invites_required || 1)) * 100)}%`, backgroundColor: "#3C8F7C" },
                      ]}
                    />
                  </View>
                  <Text style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}>
                    {referral.successful_invites} of {referral.successful_invites_required} successful invites (signup + first ride)
                  </Text>
                  {referral.can_claim ? (
                    <TouchableOpacity
                      onPress={claimReferral}
                      disabled={claimingReferral}
                      style={[tw`mt-3 py-3 rounded-xl items-center justify-center`, { backgroundColor: "#3C8F7C" }]}
                    >
                      {claimingReferral ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text style={tw.style(`text-base text-white`, { fontFamily: "RobotoBold" })}>
                          Claim reward
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => router.push("/(app)/(tabs)/(profile)/invite")}
                      style={[tw`mt-3 py-3 rounded-xl items-center justify-center border-2`, { borderColor: "#3C8F7C" }]}
                    >
                      <Text style={tw.style(`text-base`, { fontFamily: "RobotoBold", color: "#3C8F7C" })}>
                        Invite Friends
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}
            {milestone?.available ? (
              <View style={tw`mb-4 mt-1`}>
                <View
                  style={tw.style(
                    `rounded-2xl overflow-hidden px-4 py-4 border-2`,
                    milestone.claimed ? `bg-[#E8F5E9] border-[#3C8F7C]` : `bg-white border-[#3C8F7C]`
                  )}
                >
                  <View style={tw`flex-row items-start justify-between gap-2 mb-2`}>
                    <View style={tw`flex-row items-start gap-2 flex-1 min-w-0`}>
                      <View style={tw`w-10 h-10 rounded-full bg-[#3C8F7C] items-center justify-center flex-shrink-0`}>
                        <MaterialCommunityIcons name="gift-outline" size={22} color="white" />
                      </View>
                      <View style={tw`flex-1 min-w-0`}>
                        <Text style={tw.style(`text-lg text-[#2A2A2A]`, { fontFamily: "RobotoBold" })}>
                          Free ₦1,000 after 10 rides
                        </Text>
                      </View>
                    </View>
                    {milestone.claimed && (
                      <View style={tw`bg-[#3C8F7C] px-2 py-1 rounded-full flex-shrink-0`}>
                        <Text style={tw.style(`text-xs text-white`, { fontFamily: "RobotoBold" })}>Claimed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={tw.style(`text-sm text-[#555] mb-3`, { fontFamily: "RobotoRegular" })}>
                    {milestone.message}
                  </Text>
                  {!milestone.claimed && (
                    <>
                      <View style={tw`h-2 bg-gray-200 rounded-full overflow-hidden mb-2`}>
                        <View
                          style={[
                            tw`h-full rounded-full`,
                            { width: `${progress * 100}%`, backgroundColor: "#3C8F7C" },
                          ]}
                        />
                      </View>
                      <Text style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}>
                        {milestone.completed_rides} of {milestone.target_rides} rides completed
                      </Text>
                      {milestone.can_claim && (
                        <TouchableOpacity
                          onPress={claimMilestone}
                          disabled={claiming}
                          style={[tw`mt-3 py-3 rounded-xl items-center justify-center`, { backgroundColor: "#3C8F7C" }]}
                        >
                          {claiming ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text style={tw.style(`text-base text-white`, { fontFamily: "RobotoBold" })}>
                              Claim ₦1,000 now
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              </View>
            ) : null}
            </>
          }
          ListEmptyComponent={
            data.length === 0 &&
            !(milestone?.available) &&
            !(referral?.available && referral?.enabled) ? (
              <View style={tw`items-center py-6`}>
                <EmptyData />
                <Text style={tw.style(`text-base text-[#8F92A1] mt-4 text-center`, { fontFamily: "RobotoRegular" })}>
                  No offers at the moment.
                </Text>
                <Text style={tw.style(`text-sm text-[#8F92A1] mt-2 text-center`, { fontFamily: "RobotoRegular" })}>
                  Check back later for new promotions!
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <ListItem item={item} index={index} showModal={showModal} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tw.color("base-green")}
            />
          }
        />
      )}
      <Portal>
        <BottomSheet
          height={"88%"}
          ref={bottomSheetRef}
          animationType="spring"
          backdropMaskColor="#1919190D"
          disableKeyboardHandling={false}
          customDragHandleComponent={() => (
            <Svg
              style={tw`self-center mt-4`}
              width="53"
              height="15"
              viewBox="0 0 55 16"
              fill="none"
            >
              <Path
                d="M48.0634 0.655518C50.2785 -0.233197 53.065 -0.121905 53.8831 1.58598C54.7012 3.29387 53.7999 5.48816 52.1208 6.60559L30.0286 14.58C28.0651 15.315 27.0771 15.2812 25.1336 14.58L3.04596 6.60559C1.51703 5.66321 0.14728 3.79647 1.15717 1.58598C2.16706 -0.624512 5.22807 -0.107953 7.16754 0.655518L27.5816 8.28898L48.0634 0.655518Z"
                fill="black"
              />
            </Svg>
          )}
          style={tw`px-4 rounded-t-[40px] bg-white`}
          openDuration={1000}
          closeDuration={1000}
        >
          <Text
            style={tw.style(
              `text-center text-xl mt-3 mb-2 pb-3.5 border-b border-[#DDDDDD]`,
              {
                fontFamily: "RobotoMedium",
              }
            )}
          >
            Special Offer
          </Text>
          <View
            style={tw`my-3 flex-col items-center gap-y-2 pb-3.5 border-b border-[#B8B8B8] border-dashed`}
          >
            <Svg
              style={tw`self-center`}
              width="101"
              height="101"
              viewBox="0 0 101 101"
              fill="none"
            >
              <G clip-path="url(#clip0_250_21498)">
                <Path
                  d="M81.6086 10.3716H57.8852C55.1354 10.3716 52.4981 11.464 50.5536 13.4085L3.13345 60.829C1.78364 62.1786 1.78364 64.3671 3.13345 65.7167L34.9043 97.4876C36.2542 98.8374 38.4424 98.8374 39.792 97.4876L87.2122 50.0673C89.1567 48.123 90.2491 45.4856 90.2491 42.7356V19.0122C90.2493 14.2403 86.3807 10.3716 81.6086 10.3716ZM80.0901 27.8626C78.0655 29.8872 74.7829 29.8872 72.7585 27.8626C70.7338 25.838 70.7338 22.5556 72.7585 20.531C74.7831 18.5063 78.0657 18.5063 80.0901 20.531C82.1147 22.5556 82.1149 25.8378 80.0901 27.8626Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M8.32036 66.0159L55.7405 18.5956C57.685 16.6513 60.3223 15.5587 63.0721 15.5587H86.7954C87.8231 15.5587 88.795 15.769 89.7094 16.0983C88.5098 12.7675 85.3528 10.3718 81.6084 10.3718H57.8852C55.1354 10.3718 52.4981 11.4641 50.5536 13.4087L3.13345 60.829C1.78364 62.1786 1.78364 64.3671 3.13345 65.7167L8.32036 70.9036C6.97036 69.554 6.97036 67.3655 8.32036 66.0159Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M100.5 6.93114C100.508 5.10516 99.8029 3.3909 98.5158 2.10379C97.2289 0.81688 95.5111 0.112974 93.6885 0.119614C91.8678 0.127232 90.1537 0.842661 88.8621 2.13407C88.3152 2.68094 87.3205 3.86219 86.7764 4.51786C86.2049 5.20633 86.2994 6.22782 86.9879 6.79911C87.6762 7.37059 88.6977 7.27606 89.2691 6.58758C90.1215 5.56102 90.826 4.75262 91.1531 4.42528C91.8363 3.74227 92.7414 3.36376 93.702 3.35965C93.7072 3.35965 93.7121 3.35965 93.7174 3.35965C94.667 3.35965 95.557 3.72684 96.2246 4.39461C96.8959 5.0659 97.2637 5.9618 97.2596 6.91727C97.2555 7.87762 96.877 8.7827 96.1939 9.4661C95.5824 10.0776 93.4805 11.745 90.4689 13.8487C88.6875 10.803 85.3836 8.75126 81.6076 8.75126H57.8844C54.682 8.75126 51.6715 9.99833 49.4068 12.2626L1.98691 59.6833C1.02812 60.6421 0.5 61.9169 0.5 63.2727C0.5 64.6286 1.02812 65.9036 1.98691 66.8622L33.7578 98.6331C34.7477 99.6227 36.0473 100.117 37.3473 100.117C38.6473 100.117 39.9473 99.6225 40.9367 98.6331L88.357 51.213C90.6213 48.9485 91.8684 45.938 91.8684 42.7354V19.0122C91.8684 18.312 91.7975 17.6284 91.6631 16.9673C95.091 14.6085 97.6074 12.6352 98.4852 11.7575C99.777 10.4661 100.492 8.75204 100.5 6.93114ZM88.6283 19.0122V42.7354C88.6283 45.0723 87.7182 47.2694 86.066 48.9216L38.6457 96.3421C37.9301 97.0579 36.7648 97.0579 36.049 96.3421L4.27813 64.5712C3.93145 64.2245 3.74023 63.7634 3.74023 63.2727C3.74023 62.7821 3.93125 62.3212 4.27813 61.9745L51.6982 14.5544C53.3508 12.902 55.5477 11.9921 57.8844 11.9921H81.6076C84.2717 11.9921 86.5939 13.4837 87.783 15.6755C85.8693 16.9427 83.7266 18.2901 81.4533 19.6151C81.3824 19.5374 81.31 19.4604 81.2348 19.3852C78.5816 16.7321 74.2648 16.7321 71.6117 19.3852C68.9586 22.0384 68.9586 26.3552 71.6117 29.0083C72.9383 30.3348 74.6809 30.9979 76.4232 30.9979C78.1656 30.9979 79.9082 30.3348 81.2348 29.0083C83.0057 27.2374 83.5926 24.7259 82.9996 22.462C84.9768 21.311 86.8754 20.1347 88.6275 18.9966C88.6279 19.0018 88.6283 19.0071 88.6283 19.0122ZM74.9764 24.9247C75.2609 25.4905 75.832 25.8171 76.425 25.8171C76.6697 25.8171 76.9184 25.7614 77.152 25.6438C78.1016 25.1661 79.0479 24.6692 79.9848 24.1602C79.9941 25.085 79.6484 26.0128 78.9441 26.7169C77.5543 28.1065 75.2934 28.1065 73.9035 26.7169C72.5139 25.327 72.5139 23.0661 73.9035 21.6763C74.5984 20.9813 75.5111 20.6341 76.4238 20.6341C77.1465 20.6341 77.867 20.8556 78.4816 21.2909C77.5646 21.7893 76.634 22.2774 75.6959 22.7495C74.8961 23.1515 74.574 24.1255 74.9764 24.9247Z"
                  fill="black"
                />
                <Path
                  d="M48.7744 33.119C47.8797 33.119 47.1543 33.8442 47.1543 34.7391V68.9538C47.1543 69.8485 47.8797 70.5739 48.7744 70.5739C49.6691 70.5739 50.3945 69.8485 50.3945 68.9538V34.7391C50.3945 33.844 49.6691 33.119 48.7744 33.119Z"
                  fill="black"
                />
                <Path
                  d="M31.7418 47.0351C29.0887 49.6882 29.0887 54.005 31.7418 56.6581C33.0686 57.9849 34.8107 58.648 36.5533 58.6478C38.2955 58.6478 40.0383 57.9843 41.3646 56.6581C42.65 55.3728 43.3578 53.6642 43.3578 51.8466C43.3578 50.029 42.65 48.3204 41.3646 47.0353C38.7115 44.3817 34.3945 44.3819 31.7418 47.0351ZM39.0734 54.3667C37.6836 55.7565 35.4227 55.7563 34.033 54.3667C32.6434 52.9769 32.6434 50.7159 34.033 49.3261C34.7279 48.6312 35.6406 48.2839 36.5533 48.2839C37.466 48.2839 38.3787 48.6312 39.0736 49.3261C39.7469 49.9993 40.1176 50.8942 40.1176 51.8464C40.1174 52.7985 39.7467 53.6935 39.0734 54.3667Z"
                  fill="black"
                />
                <Path
                  d="M56.1812 47.0351C53.5281 49.6882 53.5281 54.005 56.1812 56.6581C57.5078 57.9847 59.2502 58.6478 60.9928 58.6478C62.7352 58.6478 64.4777 57.9847 65.8041 56.6581C68.4572 54.005 68.4572 49.6882 65.8041 47.0351C63.151 44.3818 58.8338 44.382 56.1812 47.0351ZM63.5127 54.3667C62.1228 55.7566 59.8619 55.7564 58.4723 54.3667C57.0826 52.9769 57.0826 50.7159 58.4723 49.3261C59.1672 48.6312 60.0799 48.2839 60.9926 48.2839C61.9053 48.2839 62.818 48.6312 63.5129 49.3261C64.9025 50.7159 64.9025 52.9769 63.5127 54.3667Z"
                  fill="black"
                />
              </G>
              <Defs>
                <ClipPath id="clip0_250_21498">
                  <Rect
                    width="100"
                    height="100"
                    fill="white"
                    transform="translate(0.5 0.118652)"
                  />
                </ClipPath>
              </Defs>
            </Svg>

            <Text
              style={tw.style(`text-center text-[28px]`, {
                fontFamily: "RobotoBold",
              })}
            >
              {current.title}
            </Text>
            <Text
              style={tw.style(`text-center text-xs text-[#B8B8B8]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {current.text}
            </Text>
            {current.discount_type && current.discount_value && (
              <View style={tw`mt-2 bg-base-green/10 rounded-lg p-3`}>
                <Text
                  style={tw.style(`text-center text-base text-base-green`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  {current.discount_type === "percentage"
                    ? `${current.discount_value}% Discount`
                    : `₦${current.discount_value} Discount`}
                </Text>
                {current.max_discount && current.discount_type === "percentage" && (
                  <Text
                    style={tw.style(`text-center text-xs text-[#8F92A1] mt-1`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Maximum discount: ₦{current.max_discount}
                  </Text>
                )}
                {current.min_amount && (
                  <Text
                    style={tw.style(`text-center text-xs text-[#8F92A1] mt-1`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Minimum ride amount: ₦{current.min_amount}
                  </Text>
                )}
              </View>
            )}
            {(current.valid_from || current.valid_to) && (
              <View style={tw`mt-2`}>
                {current.valid_from && (
                  <Text
                    style={tw.style(`text-center text-xs text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Valid from: {new Date(current.valid_from).toLocaleDateString()}
                  </Text>
                )}
                {current.valid_to && (
                  <Text
                    style={tw.style(`text-center text-xs text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Valid until: {new Date(current.valid_to).toLocaleDateString()}
                  </Text>
                )}
              </View>
            )}
            {current.applicable_vehicle_types &&
              current.applicable_vehicle_types.length > 0 && (
                <View style={tw`mt-2`}>
                  <Text
                    style={tw.style(`text-center text-xs text-[#8F92A1] mb-1`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Applicable to:
                  </Text>
                  <View style={tw`flex-row flex-wrap justify-center gap-x-2`}>
                    {current.applicable_vehicle_types.map((vt, idx) => (
                      <View
                        key={idx}
                        style={tw`bg-gray-100 px-2 py-1 rounded`}
                      >
                        <Text
                          style={tw.style(`text-xs text-black`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          {vt.display_name || vt.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            <TouchableOpacity
              onPress={async () => {
                await Clipboard.setStringAsync(current?.code);
                showMessage({
                  type: "success",
                  message: "Promo code copied to clipboard!",
                });
              }}
              style={tw`flex-row justify-center items-center gap-x-2 w-[150px] h-[40px] my-2  relative`}
            >
              <Text
                style={tw.style(`text-lg text-black z-10`, {
                  fontFamily: "RobotoBold",
                })}
              >
                {current.code}
              </Text>
              <MaterialCommunityIcons
                name="content-copy"
                size={19}
                color="black"
              />
              <Svg
                style={tw`absolute inset-0`}
                width="150"
                height="40"
                viewBox="0 0 151 40"
                fill="none"
              >
                <Rect
                  x="0.5"
                  y="0.118652"
                  width="150"
                  height="39"
                  rx="5"
                  fill="url(#paint0_linear_250_21506)"
                  fill-opacity="0.64"
                />
                <Defs>
                  <LinearGradient
                    id="paint0_linear_250_21506"
                    x1="87.4556"
                    y1="13.8547"
                    x2="42.9679"
                    y2="78.0305"
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop stopColor="#3C8F7C" stopOpacity="0.2" />
                    <Stop offset="1" stopColor="#3C8F7C" />
                  </LinearGradient>
                </Defs>
              </Svg>
            </TouchableOpacity>
          </View>
          <View>
            <Text
              style={tw.style(`text-sm text-[#414141] z-10`, {
                fontFamily: "RobotoBold",
              })}
            >
              Terms and Conditions
            </Text>

            <View style={tw`my-2 flex-col gap-y-1`}>
              {List.map((text) => (
                <View key={text} style={tw`flex-row items-start gap-x-1`}>
                  <Entypo name="dot-single" size={19} color="#A0A0A0" />
                  <Text
                    style={tw.style("text-[13px] text-[#A0A0A0] basis-[85%]", {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </BottomSheet>
      </Portal>
    </ImageBackground>
  );
};

export default OffersScreen;
