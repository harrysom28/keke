import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import tw from "@/lib/tailwind";
import type { LocationAccessPurpose } from "@/utils/locationPermission";

const BULLETS_COMMON = [
  "Real-time driver-passenger matching",
  "Providing navigation and route optimization",
  "Safety and emergency services",
] as const;

const BACKGROUND_BULLET: Record<LocationAccessPurpose, string> = {
  rider:
    "Location tracking during active rides, even when the app is closed or not in use, so your driver and trip progress stay accurate",
  driver:
    "Location tracking while you are online or on a trip, even when the app is closed or not in use, so riders can find you and you can receive trip requests",
};

type Props = {
  visible: boolean;
  purpose: LocationAccessPurpose;
  onAllow: () => void;
  onDeny: () => void;
};

export function LocationDisclosureModal({
  visible,
  purpose,
  onAllow,
  onDeny,
}: Props) {
  const counterparty = purpose === "driver" ? "riders" : "drivers";
  const bullets = [
    BULLETS_COMMON[0],
    `Sharing your location with ${counterparty} during active rides`,
    BULLETS_COMMON[1],
    BULLETS_COMMON[2],
    BACKGROUND_BULLET[purpose],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDeny}
    >
      <View
        style={tw`flex-1 bg-black/50 justify-center items-center px-5`}
        accessibilityViewIsModal
      >
        <View
          style={tw`w-full max-w-[360px] max-h-[85%] bg-white rounded-2xl overflow-hidden`}
        >
          <ScrollView
            style={tw`flex-shrink`}
            contentContainerStyle={tw`px-5 pt-6 pb-4`}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={tw.style(`text-xl text-black mb-4`, {
                fontFamily: "RobotoBold",
              })}
              accessibilityRole="header"
            >
              Location Data Usage
            </Text>

            <Text
              style={tw.style(`text-[15px] text-[#262628] leading-6 mb-3`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Keke Ride collects and uses your location data for the following
              purposes:
            </Text>

            {bullets.map((item) => (
              <View key={item} style={tw`flex-row items-start mb-2 pl-1`}>
                <Text
                  style={tw.style(`text-[15px] text-[#262628] mr-2`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {"\u2022"}
                </Text>
                <Text
                  style={tw.style(`flex-1 text-[15px] text-[#262628] leading-6`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {item}
                </Text>
              </View>
            ))}

            <Text
              style={tw.style(
                `text-[13px] text-[#5A5A5A] leading-5 mt-3 mb-4 italic`,
                { fontFamily: "RobotoRegular" }
              )}
            >
              Your location data is collected continuously during an active
              ride, even when the app is closed or not in use, to ensure
              accurate tracking and safety. Location access is required to use
              Keke Ride's core features.
            </Text>

            <Text
              style={tw.style(`text-[15px] text-black leading-6`, {
                fontFamily: "RobotoBold",
              })}
            >
              Do you agree to allow Keke Ride to access your location data for
              these purposes?
            </Text>
          </ScrollView>

          <View style={tw`flex-row justify-end items-center gap-x-3 px-5 pb-5 pt-2`}>
            <Pressable
              onPress={onDeny}
              style={tw`px-4 py-3 min-h-[44px] justify-center`}
              accessibilityRole="button"
              accessibilityLabel="Deny location access"
            >
              <Text
                style={tw.style(`text-base-green text-base`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Deny
              </Text>
            </Pressable>

            <Pressable
              onPress={onAllow}
              style={tw`px-6 py-3 min-h-[44px] justify-center bg-white border border-[#E0E0E0] rounded-full shadow-sm`}
              accessibilityRole="button"
              accessibilityLabel="Allow location access"
            >
              <Text
                style={tw.style(`text-base-green text-base`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Allow
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
