import React, { memo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BookRideHowToModalProps {
  visible: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: 'place' as const,
    iconFamily: 'MaterialIcons' as const,
    title: 'Set pickup & destination',
    description: 'Enter where you want to be picked up and where you\'re going.',
  },
  {
    icon: 'event' as const,
    iconFamily: 'MaterialIcons' as const,
    title: 'Pick date & time',
    description: 'Choose when you want to ride — now or schedule for later.',
  },
  {
    icon: 'directions-car' as const,
    iconFamily: 'MaterialIcons' as const,
    title: 'Choose vehicle',
    description: 'Select Keke, Okada, Taxi, or your preferred option.',
  },
  {
    icon: 'check-circle' as const,
    iconFamily: 'AntDesign' as const,
    title: 'Confirm & pay',
    description: 'Review the fare and confirm. You\'re all set.',
  },
];

const BookRideHowToModal = memo(({ visible, onClose }: BookRideHowToModalProps) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <StatusBar barStyle="dark-content" />
      <View style={tw`flex-1 bg-white`}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-[#EFEFEF]`}>
          <Text
            style={tw.style('text-xl text-[#242E42]', {
              fontFamily: 'RobotoBold',
            })}
          >
            How to book a ride
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={tw`w-10 h-10 rounded-full bg-[#F5F5F5] items-center justify-center`}
            activeOpacity={0.7}
          >
            <AntDesign name="close" size={22} color="#242E42" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`px-6 py-6 pb-8`}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={tw.style('text-base text-[#8E8E93] leading-6 mb-6', {
              fontFamily: 'RobotoRegular',
            })}
          >
            Book a scheduled ride in a few simple steps:
          </Text>

          {steps.map((step, index) => (
            <View key={index} style={tw`flex-row gap-x-4 mb-5`}>
              <View style={tw`w-10 h-10 rounded-full bg-base-green/10 items-center justify-center flex-shrink-0`}>
                {step.iconFamily === 'AntDesign' ? (
                  <AntDesign name={step.icon as any} size={22} color={tw.color('base-green')} />
                ) : (
                  <MaterialIcons name={step.icon as any} size={22} color={tw.color('base-green')} />
                )}
              </View>
              <View style={tw`flex-1`}>
                <Text
                  style={tw.style('text-base text-[#242E42] mb-1', {
                    fontFamily: 'RobotoBold',
                  })}
                >
                  {step.title}
                </Text>
                <Text
                  style={tw.style('text-sm text-[#8E8E93] leading-5', {
                    fontFamily: 'RobotoRegular',
                  })}
                >
                  {step.description}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={tw`px-6 pb-8 pt-4 bg-white border-t border-[#F0F0F0]`}>
          <TouchableOpacity
            onPress={onClose}
            style={tw`bg-base-green py-4 px-6 rounded-full items-center justify-center`}
            activeOpacity={0.8}
          >
            <Text
              style={tw.style('text-lg text-white', {
                fontFamily: 'RobotoBold',
              })}
            >
              Got it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

BookRideHowToModal.displayName = 'BookRideHowToModal';

export default BookRideHowToModal;
