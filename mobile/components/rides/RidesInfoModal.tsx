import React, { memo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Dimensions,
  StatusBar,
} from 'react-native';
import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface RidesInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const RidesInfoModal = memo(({ visible, onClose }: RidesInfoModalProps) => {
  const features = [
    {
      icon: 'event',
      iconFamily: 'MaterialIcons' as const,
      title: 'Schedule your ride ahead',
      description: 'Plan your trips in advance and secure your ride. Schedule rides up to 90 days ahead — from anywhere in Abakaliki, to anywhere you need to go.',
    },
    {
      icon: 'reload',
      iconFamily: 'AntDesign' as const,
      title: 'Rebook with one tap',
      description: 'Save time by quickly rebooking any of your past rides. Just tap the rebook button and you\'re on your way.',
    },
    {
      icon: 'check-circle',
      iconFamily: 'AntDesign' as const,
      title: 'All your rides in one place',
      description: 'Easily view and manage all your rides — whether they\'re upcoming or in your history. Track everything from one convenient screen.',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw`flex-1 bg-white`}>
        {/* Header Image Section */}
        <View style={[tw`relative`, { height: SCREEN_HEIGHT * 0.4 }]}>
          <ImageBackground
            source={require('@/assets/images/pattern-bg.png')}
            style={tw`absolute inset-0 w-full h-full`}
            resizeMode="cover"
          >
            <View style={tw`absolute inset-0 bg-black/50`} />
          </ImageBackground>
          
          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            style={tw`absolute top-12 left-4 z-10 w-10 h-10 rounded-full bg-white/20 items-center justify-center`}
            activeOpacity={0.7}
          >
            <AntDesign name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <ScrollView
          style={tw`flex-1 bg-white`}
          contentContainerStyle={tw`px-6 py-8`}
          showsVerticalScrollIndicator={false}
        >
          {/* Title and Description */}
          <View style={tw`mb-8`}>
            <Text
              style={tw.style(`text-3xl text-[#242E42] mb-3`, {
                fontFamily: 'RobotoBold',
              })}
            >
              Rides
            </Text>
            <Text
              style={tw.style(`text-base text-[#8E8E93] leading-6`, {
                fontFamily: 'RobotoRegular',
              })}
            >
              Your travel, simplified. Manage all your rides — past, present, and future — all in one convenient place.
            </Text>
          </View>

          {/* Features List */}
          <View style={tw`mb-8 gap-y-6`}>
            {features.map((feature, index) => (
              <View key={index} style={tw`flex-row gap-x-4`}>
                {/* Icon */}
                <View style={tw`w-12 h-12 rounded-full bg-base-green/10 items-center justify-center flex-shrink-0`}>
                  {feature.iconFamily === 'AntDesign' ? (
                    <AntDesign name={feature.icon as any} size={24} color={tw.color('base-green')} />
                  ) : (
                    <MaterialIcons name={feature.icon as any} size={24} color={tw.color('base-green')} />
                  )}
                </View>

                {/* Content */}
                <View style={tw`flex-1`}>
                  <Text
                    style={tw.style(`text-lg text-[#242E42] mb-2`, {
                      fontFamily: 'RobotoBold',
                    })}
                  >
                    {feature.title}
                  </Text>
                  <Text
                    style={tw.style(`text-sm text-[#8E8E93] leading-5`, {
                      fontFamily: 'RobotoRegular',
                    })}
                  >
                    {feature.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* CTA Button */}
        <View style={tw`px-6 pb-8 pt-4 bg-white border-t border-[#F0F0F0]`}>
          <TouchableOpacity
            onPress={onClose}
            style={tw`bg-base-green py-4 px-6 rounded-full items-center justify-center`}
            activeOpacity={0.8}
          >
            <Text
              style={tw.style(`text-lg text-white`, {
                fontFamily: 'RobotoBold',
              })}
            >
              View my rides
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

RidesInfoModal.displayName = 'RidesInfoModal';

export default RidesInfoModal;
