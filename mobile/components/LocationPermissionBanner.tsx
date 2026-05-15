import React from "react";
import { Text, View } from "react-native";
import tw from "@/lib/tailwind";
import { TouchableAction } from "@/components/ui/TouchableAction";
import type { LocationAccessPurpose } from "@/utils/locationPermission";

type Props = {
  purpose: LocationAccessPurpose;
  loading?: boolean;
  onEnable: () => void;
};

export function LocationPermissionBanner({
  purpose,
  loading,
  onEnable,
}: Props) {
  const isDriver = purpose === "driver";
  return (
    <View
      style={tw`mx-4 mt-2 px-4 py-3 bg-amber-100 rounded-xl`}
      accessibilityRole="alert"
    >
      <Text
        style={tw`text-amber-900 text-sm mb-3`}
        accessibilityLabel="Location permission message"
      >
        {isDriver
          ? "Location access is required to go online and receive ride requests."
          : "Location access is needed to show your position on the map and find drivers."}
      </Text>
      <TouchableAction
        label={loading ? "Checking…" : "Enable location"}
        onPress={onEnable}
        disabled={loading}
        containerStyle={tw`bg-amber-600 rounded-lg py-3 min-h-[44px]`}
        labelStyle={tw`text-white text-sm`}
      />
    </View>
  );
}
