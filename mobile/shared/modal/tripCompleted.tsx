import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Text,
  View,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";

import { AntDesign } from "@expo/vector-icons";
import React, { memo, useEffect, useState } from "react";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import apiClient from "@/utils/apiClient";
import tw from "@/lib/tailwind";

interface Props {
  visible: boolean;
  view: "driver" | "passenger";
  onClose: () => void;
  action: () => void;
  cost: string;
  paymentType?: string;
  /** Driver view: show a spinner on the primary action while confirming. */
  confirmLoading?: boolean;
  /** Optional review action (driver rates the passenger). */
  onReview?: () => void;
  /** Driver view (cash only): open the "pay change" flow. */
  onPayChange?: () => void;
}

// In-app payments (wallet/card) are settled by the system before the trip, so
// the driver never needs to confirm them. Everything else (cash) requires the
// driver to confirm collection.
const IN_APP_PAYMENT_METHODS = ["wallet", "card", "stripe"];

const TripCompletedModal = ({
  visible,
  view,
  onClose,
  action,
  cost,
  paymentType,
  confirmLoading = false,
  onReview,
  onPayChange,
}: Props) => {
  const isPassenger = view === "passenger";
  const normalizedPayment = String(paymentType ?? "").toLowerCase();
  const isCashPayment = normalizedPayment === "cash";
  const requiresConfirmation = !IN_APP_PAYMENT_METHODS.includes(normalizedPayment);
  const insets = useCombinedSafeInsets();
  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !isPassenger) {
      setMilestoneMessage(null);
      return;
    }
    apiClient
      .get("special/offers/milestone")
      .then(({ data: res }) => {
        const d = res?.data;
        if (!d?.available || d?.claimed) return;
        if (d?.can_claim) {
          setMilestoneMessage("You've unlocked a free ₦1,000! Claim it in the Offers tab.");
        } else if (d?.rides_remaining >= 1 && d?.rides_remaining <= 3) {
          setMilestoneMessage(
            d.rides_remaining === 1
              ? "1 more ride to unlock your free ₦1,000!"
              : `${d.rides_remaining} more rides to unlock your free ₦1,000!`
          );
        } else {
          setMilestoneMessage(null);
        }
      })
      .catch(() => setMilestoneMessage(null));
  }, [visible, isPassenger]);
  return (
    <Modal visible={visible} transparent style={tw`flex-1`}>
      <ImageBackground
        source={require("@/assets/images/map-bg.png")}
        style={tw`flex-1`}
      >
        <View
          style={tw`flex-1 relative flex-col justify-center px-3.5 bg-[#1919194D]`}
        >
          <TouchableOpacity
            onPress={onClose}
            style={tw.style(`absolute top-0 right-0 z-50`, {
              paddingTop: insets.top + 12,
              paddingRight: 12 + insets.right,
            })}
            activeOpacity={0.7}
          >
            <View style={tw`h-[36px] w-[36px] flex-col items-center justify-center bg-black rounded-full`}>
              <AntDesign name="close" size={22} color="white" />
            </View>
          </TouchableOpacity>

          <View
            style={tw`flex-col justify-center items-center p-7 gap-y-5 min-h-[514px] bg-white rounded-[12px]`}
          >
            <Image
              resizeMode="contain"
              source={require("@images/trip.png")}
              style={tw`w-[122px] h-[122px]`}
            />
            <Text
              style={tw.style(`text-2xl text-black text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Trip Completed
            </Text>
            {isPassenger ? (
              <>
                <Text
                  style={tw.style(`text-base text-[#242E42] text-center`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  You`ve arrived your location, pls wait for the driver to
                  confirm payment
                </Text>
                <View>
                  <Text
                    style={tw.style(`text-[15px] text-[#5A5A5A] text-center`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Trip Amount
                  </Text>
                  <Text
                    style={tw.style(`text-[34px] text-[#2A2A2A] text-center`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    ₦ {cost}
                  </Text>
                  <Text
                    style={tw.style(`text-[12px] text-[#8E8E93] text-center mt-1`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    {isCashPayment
                      ? `Pay driver ₦${cost} in cash if you haven't already.`
                      : `₦${cost} settled automatically from your wallet. No cash exchanged.`}
                  </Text>
                </View>
                <Text
                  style={tw.style(`text-base text-[#A0A0A0] text-center`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  This will take a few seconds
                </Text>
                {milestoneMessage ? (
                  <View style={tw`mt-2 px-4 py-2 rounded-xl bg-[#E8F5E9] border border-[#3C8F7C]`}>
                    <Text style={tw.style(`text-sm text-[#2A2A2A] text-center`, { fontFamily: "RobotoMedium" })}>
                      🎁 {milestoneMessage}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text
                  style={tw.style(`text-base text-[#242E42] text-center`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {requiresConfirmation
                    ? "Your passenger should pay the fare in cash. Confirm once you've received payment."
                    : "Payment for this trip was completed in-app. No cash to collect."}
                </Text>

                <View>
                  <Text
                    style={tw.style(`text-[15px] text-[#5A5A5A] text-center`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Trip Amount
                  </Text>
                  <Text
                    style={tw.style(`text-[34px] text-[#2A2A2A] text-center`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    ₦ {cost}
                  </Text>
                </View>
              </>
            )}
            <View style={tw`w-full flex-col gap-y-3`}>
              <TouchableOpacity
                onPress={action}
                disabled={confirmLoading}
                style={tw`w-full py-3.5 bg-base-green rounded-[8px]`}
              >
                {confirmLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text
                    style={tw.style(`text-base text-center text-white`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {isPassenger
                      ? "View summary & rate"
                      : requiresConfirmation
                        ? "Confirm Payment"
                        : "Done"}
                  </Text>
                )}
              </TouchableOpacity>

              {!isPassenger && requiresConfirmation && onPayChange ? (
                <TouchableOpacity
                  onPress={onPayChange}
                  disabled={confirmLoading}
                  style={tw`w-full py-3.5 border border-base-green rounded-[8px]`}
                >
                  <Text
                    style={tw.style(`text-base text-center text-base-green`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Pay change
                  </Text>
                </TouchableOpacity>
              ) : null}

              {!isPassenger && onReview ? (
                <TouchableOpacity
                  onPress={onReview}
                  disabled={confirmLoading}
                  style={tw`w-full py-3.5`}
                >
                  <Text
                    style={tw.style(`text-base text-center text-base-green`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Rate passenger (optional)
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </ImageBackground>
    </Modal>
  );
};

export default memo(TripCompletedModal);
