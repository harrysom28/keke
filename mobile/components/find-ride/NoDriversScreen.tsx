import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

interface NoDriversScreenProps {
  onRetry?: () => void;
  onBack?: () => void;
}

export const NoDriversScreen: React.FC<NoDriversScreenProps> = ({ onRetry, onBack }) => {
  return (
    <View style={tw`flex-1 justify-center items-center px-6 py-12 bg-white`}>
      {/* Icon */}
      <View style={tw`mb-6`}>
        <View style={tw`bg-[#F5F5F5] rounded-full p-6 items-center justify-center`}>
          <MaterialIcons name="directions-car" size={64} color={tw.color("base-green")} style={tw`opacity-40`} />
        </View>
      </View>

      {/* Title */}
      <Text
        style={tw.style(`text-2xl text-[#242E42] text-center mb-3`, {
          fontFamily: "RobotoBold",
        })}
      >
        No Drivers Available
      </Text>

      {/* Description */}
      <Text
        style={tw.style(`text-base text-[#8E8E93] text-center mb-8 leading-6 px-4`, {
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
            style={tw`bg-base-green py-4 px-6 rounded-[12px] flex-row items-center justify-center gap-x-2`}
            activeOpacity={0.8}
          >
            <AntDesign name="reload" size={20} color="white" />
            <Text
              style={tw.style(`text-lg text-white`, {
                fontFamily: "RobotoBold",
              })}
            >
              Try Again
            </Text>
          </TouchableOpacity>
        )}

        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={tw`bg-white border-2 border-[#E5E5E5] py-4 px-6 rounded-[12px] flex-row items-center justify-center gap-x-2`}
            activeOpacity={0.8}
          >
            <AntDesign name="left" size={20} color={tw.color("base-green")} />
            <Text
              style={tw.style(`text-lg text-base-green`, {
                fontFamily: "RobotoBold",
              })}
            >
              Change Location
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Helpful Tips */}
      <View style={tw`mt-8 w-full`}>
        <Text
          style={tw.style(`text-sm text-[#8E8E93] text-center mb-3`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Tips to find drivers:
        </Text>
        <View style={tw`gap-y-2`}>
          <View style={tw`flex-row items-center gap-x-2`}>
            <View style={tw`w-1.5 h-1.5 bg-base-green rounded-full`} />
            <Text style={tw.style(`text-sm text-[#8E8E93]`, { fontFamily: "RobotoRegular" })}>
              Try during peak hours (morning & evening)
            </Text>
          </View>
          <View style={tw`flex-row items-center gap-x-2`}>
            <View style={tw`w-1.5 h-1.5 bg-base-green rounded-full`} />
            <Text style={tw.style(`text-sm text-[#8E8E93]`, { fontFamily: "RobotoRegular" })}>
              Adjust your pickup location slightly
            </Text>
          </View>
          <View style={tw`flex-row items-center gap-x-2`}>
            <View style={tw`w-1.5 h-1.5 bg-base-green rounded-full`} />
            <Text style={tw.style(`text-sm text-[#8E8E93]`, { fontFamily: "RobotoRegular" })}>
              Try a different vehicle type
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};
