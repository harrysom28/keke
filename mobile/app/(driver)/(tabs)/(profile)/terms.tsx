import React from "react";
import {
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import tw from "@/lib/tailwind";

const TermsScreen = () => {
  const handleContactSupport = () => {
    router.push("/(driver)/(tabs)/(profile)/contact");
  };

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between w-[75%]`}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={tw`bg-black p-1 rounded-full`}
          >
            <AntDesign name="left" size={24} color="white" />
          </TouchableOpacity>
          <Text
            style={tw.style(`text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            Terms & Privacy
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={tw`px-6 py-4 pb-8`}>
        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-2xl text-black mb-4`, {
              fontFamily: "RobotoBold",
            })}
          >
            Terms of Service
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-4`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Last updated: {new Date().toLocaleDateString()}
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Welcome to Keke. By using our ride-sharing service, you agree to
            comply with and be bound by the following terms and conditions.
            Please review them carefully.
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            1. Service Description
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Keke provides a platform connecting passengers with drivers for
            transportation services. We act as an intermediary and do not
            provide transportation services directly.
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            2. User Responsibilities
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • You must be at least 18 years old to use our service
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • You must provide accurate information when creating an account
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • You are responsible for maintaining the security of your account
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • You must comply with all applicable laws and regulations
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            3. Payment Terms
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            All payments are processed securely through our payment partners.
            Refunds are subject to our refund policy and will be processed
            within 5-10 business days.
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-2xl text-black mb-4`, {
              fontFamily: "RobotoBold",
            })}
          >
            Privacy Policy
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-4`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Your privacy is important to us. This policy explains how we
            collect, use, and protect your personal information.
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            Information We Collect
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • Personal information (name, email, phone number)
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • Location data for ride matching
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • Payment information (processed securely by third parties)
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • Usage data and app analytics
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            How We Use Your Information
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • To provide and improve our services
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • To process payments and transactions
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6 mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • To send important updates and notifications
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            • To ensure safety and security of our platform
          </Text>
        </View>

        <View style={tw`mb-6`}>
          <Text
            style={tw.style(`text-xl text-black mb-3`, {
              fontFamily: "RobotoBold",
            })}
          >
            Data Security
          </Text>
          <Text
            style={tw.style(`text-base text-[#333] leading-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            We implement industry-standard security measures to protect your
            personal information. However, no method of transmission over the
            internet is 100% secure.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleContactSupport}
          style={tw`bg-base-green py-3.5 rounded-lg mt-4`}
        >
          <Text
            style={tw.style(`text-center text-base text-white`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Contact Support
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
  );
};

export default TermsScreen;
