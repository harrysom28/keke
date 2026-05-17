import { Image, Text, TouchableOpacity, View } from "react-native";

import tw from "@/lib/tailwind";
import { mapRideToSummary, type RideSummaryModel } from "@/utils/rideSummaryModel";

export interface RideSummaryProps {
  ride: Record<string, unknown> | null | undefined;
  onContinue: () => void;
  onDone: () => void;
}

const TRIP_COMPLETE_IMAGE = require("@images/check.png");

export const RideSummaryView = ({ ride, onContinue, onDone }: RideSummaryProps) => {
  const model: RideSummaryModel = mapRideToSummary(ride);

  return (
    <View style={tw`flex-col gap-y-4 pb-6`}>
      <View style={tw`items-center py-4`}>
        <View
          style={tw`w-20 h-20 rounded-full bg-base-green items-center justify-center mb-3 overflow-hidden`}
        >
          <Image
            source={TRIP_COMPLETE_IMAGE}
            resizeMode="contain"
            style={{ width: 52, height: 52 }}
          />
        </View>
        <Text style={tw.style(`text-2xl text-black`, { fontFamily: "RobotoBold" })}>
          Ride Complete
        </Text>
        <Text
          style={tw.style(`text-sm text-[#8F92A1] mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {model.driver_name
            ? `${model.driver_name} dropped you off`
            : "Your driver dropped you off"}
        </Text>
      </View>

      <View style={tw`bg-base-green rounded-2xl p-5 items-center`}>
        <Text
          style={tw.style(`text-white text-sm mb-1 opacity-90`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Total paid
        </Text>
        <Text style={tw.style(`text-white text-5xl`, { fontFamily: "RobotoBold" })}>
          ₦{model.fareDisplay}
        </Text>
        <View style={{ marginTop: 12, width: "100%" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Ride fare</Text>
            <Text style={{ color: "#fff", fontSize: 13 }}>
              ₦{model.baseFare.toLocaleString()}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
              Service charge
            </Text>
            <Text style={{ color: "#fff", fontSize: 13 }}>
              ₦{model.serviceCharge.toLocaleString()}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.35)",
              paddingTop: 8,
              marginTop: 4,
            }}
          >
            <Text style={{ fontWeight: "700", fontSize: 14, color: "#fff" }}>
              Total charged
            </Text>
            <Text style={{ fontWeight: "700", fontSize: 14, color: "#fff" }}>
              ₦{model.total.toLocaleString()}
            </Text>
          </View>
        </View>
        <Text
          style={tw.style(`text-white text-sm mt-3 opacity-90`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Paid via {model.paymentLabel}
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
              numberOfLines={3}
            >
              {model.pickup_name}
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
              numberOfLines={3}
            >
              {model.dropoff_name}
            </Text>
          </View>
        </View>
      </View>

      <View style={tw`flex-row justify-around`}>
        {model.distance ? (
          <View style={tw`items-center`}>
            <Text style={tw.style(`text-lg text-black`, { fontFamily: "RobotoBold" })}>
              {model.distance}
            </Text>
            <Text
              style={tw.style(`text-xs text-[#8F92A1]`, { fontFamily: "RobotoRegular" })}
            >
              Distance
            </Text>
          </View>
        ) : null}
        {model.duration ? (
          <View style={tw`items-center`}>
            <Text style={tw.style(`text-lg text-black`, { fontFamily: "RobotoBold" })}>
              {model.duration}
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
            {model.paymentLabel}
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
