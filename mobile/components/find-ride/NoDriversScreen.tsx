import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import tw from '@/lib/tailwind';
import { getVehicleImage } from '@/utils/vehicleImages';

interface NoDriversScreenProps {
  onRetry?: () => void;
  /** @deprecated use onChangeLocation — kept as fallback */
  onBack?: () => void;
  /** Go to location selection (e.g. find-ride step 1). Falls back to onBack. */
  onChangeLocation?: () => void;
}

export const NoDriversScreen: React.FC<NoDriversScreenProps> = ({
  onRetry,
  onBack,
  onChangeLocation,
}) => {
  const handleChangeLocation = onChangeLocation ?? onBack;

  return (
    <View style={tw`flex-1 justify-center items-center px-6 py-8 bg-white`}>
      {/* Icon — colored keke asset (vehicle-1), not washed-out PNG */}
      <View style={tw`mb-4`}>
        <View
          style={tw`bg-[#E8F5E9] rounded-full p-4 items-center justify-center`}
        >
          <Image
            source={getVehicleImage(1, 'keke')}
            resizeMode="contain"
            style={{ width: 88, height: 56 }}
          />
        </View>
      </View>

      {/* Title */}
      <Text
        style={tw.style(`text-xl text-[#242E42] text-center mb-2`, {
          fontFamily: "RobotoBold",
        })}
      >
        No Drivers Available
      </Text>

      {/* Description */}
      <Text
        style={tw.style(`text-sm text-[#8E8E93] text-center mb-5 leading-5 px-3`, {
          fontFamily: "RobotoRegular",
        })}
      >
        We couldn't find any available drivers in your area right now. Please try again in a few moments or adjust your pickup location.
      </Text>

      {/* Action Buttons */}
      <View style={tw`w-full gap-y-3`}>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            style={tw`bg-base-green py-3 px-5 rounded-[10px] flex-row items-center justify-center gap-x-2`}
            activeOpacity={0.8}
          >
            <AntDesign name="reload" size={18} color="white" />
            <Text
              style={tw.style(`text-base text-white`, {
                fontFamily: "RobotoBold",
              })}
            >
              Try Again
            </Text>
          </TouchableOpacity>
        )}

        {handleChangeLocation && (
          <TouchableOpacity
            onPress={handleChangeLocation}
            style={tw`bg-white border-2 border-[#E5E5E5] py-3 px-5 rounded-[10px] flex-row items-center justify-center gap-x-2`}
            activeOpacity={0.8}
          >
            <AntDesign name="left" size={18} color={tw.color("base-green")} />
            <Text
              style={tw.style(`text-base text-base-green`, {
                fontFamily: "RobotoBold",
              })}
            >
              Change Location
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
