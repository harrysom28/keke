import {
  Image,
  ImageBackground,
  Modal,
  StatusBar,
  Text,
  View,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";

import React, { memo } from "react";
import tw from "@/lib/tailwind";

interface Props {
  visible: boolean;
  cost: string;
  feeback: () => void;
  back: () => void;
}

const PaymentReceiptModal = ({ visible, back, feeback, cost }: Props) => {
  return (
    <Modal
      visible={visible}
      transparent
      style={tw`flex-1`}
      onRequestClose={back}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={tw.color("base-green")}
      />
      <View
        style={tw`flex-1 relative flex-col justify-center px-3.5 bg-base-green`}
      >
        <ImageBackground
          source={require("@images/ribbons.png")}
          style={tw`flex-col items-center justify-end w-full h-[70px] -mb-8`}
        >
          <Text
            style={tw.style(`text-xl text-white mb-2 text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Payment Receipt
          </Text>
        </ImageBackground>
        <ImageBackground
          resizeMode="contain"
          source={require("@images/receipt-bg.png")}
          style={tw`flex-col justify-center items-center border-0 mx-2 py-7 px-4 gap-y-5 h-[620px]`}
          imageStyle={tw`rounded-t-[24px]`}
        >
          <Image
            resizeMode="contain"
            source={require("@images/check.png")}
            style={tw`w-[122px] h-[122px]`}
          />
          <Text
            style={tw.style(`text-2xl text-black text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Payment Successful
          </Text>

          <View style={tw`pb-4 w-full border-b border-[#B8B8B8] border-dashed`}>
            <Text
              style={tw.style(`text-base text-center text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Amount
            </Text>
            <Text
              style={tw.style(`text-[34px] text-center text-[#2A2A2A]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              ₦ {cost}
            </Text>
          </View>
          <View>
            <Text
              style={tw.style(`text-base text-center text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              How was your trip?
            </Text>
            <Text
              style={tw.style(`text-base text-center text-[#A0A0A0]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Your feedback will help us to improve your experience{" "}
            </Text>
          </View>

          <View style={tw`flex-col gap-y-2 mt-2 w-full`}>
            <TouchableOpacity
              onPress={feeback}
              style={tw`w-full py-3.5 bg-base-green rounded-[8px]`}
            >
              <Text
                style={tw.style(`text-base text-center text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Leave Feedback
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={back}
              style={tw`w-full py-3.5 border border-base-green rounded-[8px]`}
            >
              <Text
                style={tw.style(`text-base text-center text-base-green`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Back Home
              </Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </View>
    </Modal>
  );
};

export default memo(PaymentReceiptModal);
