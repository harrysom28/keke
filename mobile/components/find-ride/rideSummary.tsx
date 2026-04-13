import { AntDesign } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import tw from "@/lib/tailwind";

export interface RideSummaryProps {
  ride: {
    pickup_name?: string;
    dropoff_name?: string;
    fare?: number | string;
    cost?: string;
    distance?: string | { text: string };
    duration?: string | { text: string };
    payment_type?: string;
    driver?: { driver_name?: string; driver_image?: string; rating?: number };
  };
  onContinue: () => void;
  onDone: () => void;
}

export const RideSummaryView = ({ ride, onContinue, onDone }: RideSummaryProps) => {
  const fare = ride?.fare ?? ride?.cost ?? "0";
  const distance =
    typeof ride?.distance === "object" ? ride.distance.text : ride?.distance;
  const duration =
    typeof ride?.duration === "object" ? ride.duration.text : ride?.duration;
  const paymentMethod = (ride?.payment_type ?? "wallet").toLowerCase();
  const paymentLabel =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "wallet"
        ? "Wallet"
        : paymentMethod === "card"
          ? "Card"
          : paymentMethod;

  const fareNum = Number(fare);
  const fareDisplay = Number.isFinite(fareNum) ? fareNum.toLocaleString() : String(fare);

  return (
    <View style={tw`flex-col gap-y-4 pb-6`}>
      <View style={tw`items-center py-4`}>
        <View
          style={tw`w-16 h-16 rounded-full bg-base-green items-center justify-center mb-3`}
        >
          <AntDesign name="checkcircle" size={36} color="white" />
        </View>
        <Text style={tw.style(`text-2xl text-black`, { fontFamily: "RobotoBold" })}>
          Ride Complete
        </Text>
        <Text
          style={tw.style(`text-sm text-[#8F92A1] mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {ride?.driver?.driver_name ?? "Your driver"} dropped you off
        </Text>
      </View>

      <View style={tw`bg-base-green rounded-2xl p-5 items-center`}>
        <Text
          style={tw.style(`text-white text-sm mb-1`, { fontFamily: "RobotoRegular" })}
        >
          Total fare
        </Text>
        <Text style={tw.style(`text-white text-5xl`, { fontFamily: "RobotoBold" })}>
          ₦{fareDisplay}
        </Text>
        <Text
          style={tw.style(`text-white text-sm mt-2 opacity-80`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Paid via {paymentLabel}
        </Text>
      </View>

      <View style={tw`bg-[#F8F8F8] rounded-xl p-4 gap-y-3`}>
        <View style={tw`flex-row items-start gap-x-3`}>
          <View style={tw`w-3 h-3 rounded-full bg-base-green mt-1`} />
          <View style={tw`flex-1`}>
            <Text
              style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
            >
              Pickup
            </Text>
            <Text
              style={tw.style(`text-sm text-black`, { fontFamily: "RobotoMedium" })}
              numberOfLines={2}
            >
              {ride?.pickup_name ?? "Pickup location"}
            </Text>
          </View>
        </View>
        <View style={tw`w-0.5 h-4 bg-[#E0E0E0] ml-1.5`} />
        <View style={tw`flex-row items-start gap-x-3`}>
          <View style={tw`w-3 h-3 rounded-full bg-black mt-1`} />
          <View style={tw`flex-1`}>
            <Text
              style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
            >
              Dropoff
            </Text>
            <Text
              style={tw.style(`text-sm text-black`, { fontFamily: "RobotoMedium" })}
              numberOfLines={2}
            >
              {ride?.dropoff_name ?? "Dropoff location"}
            </Text>
          </View>
        </View>
      </View>

      <View style={tw`flex-row justify-around`}>
        {distance ? (
          <View style={tw`items-center`}>
            <Text style={tw.style(`text-lg text-black`, { fontFamily: "RobotoBold" })}>
              {distance}
            </Text>
            <Text
              style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
            >
              Distance
            </Text>
          </View>
        ) : null}
        {duration ? (
          <View style={tw`items-center`}>
            <Text style={tw.style(`text-lg text-black`, { fontFamily: "RobotoBold" })}>
              {duration}
            </Text>
            <Text
              style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
            >
              Duration
            </Text>
          </View>
        ) : null}
        <View style={tw`items-center`}>
          <Text style={tw.style(`text-lg text-black`, { fontFamily: "RobotoBold" })}>
            {paymentLabel}
          </Text>
          <Text
            style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
          >
            Payment
          </Text>
        </View>
      </View>

      <TouchableOpacity onPress={onContinue} style={tw`bg-base-green py-4 rounded-xl`}>
        <Text
          style={tw.style(`text-center text-white text-base`, { fontFamily: "RobotoBold" })}
        >
          Rate your ride
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDone}>
        <Text
          style={tw.style(`text-center text-[#8F92A1] text-sm py-2`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Skip
        </Text>
      </TouchableOpacity>
    </View>
  );
};
