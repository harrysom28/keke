import {
  Image,
  ImageBackground,
  Modal,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AntDesign } from "@expo/vector-icons";
import React from "react";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import tw from "@/lib/tailwind";

interface Props {
  onClose?: () => void;
}

const PaymentReceived = ({ onClose }: Props) => {
  const insets = useCombinedSafeInsets();
  return (
    <Modal visible={true} transparent style={tw`flex-1`} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#1919194D" />
      <ImageBackground
        source={require("@/assets/images/map-bg.png")}
        style={tw`flex-1`}
      >
        <View
          style={tw`flex-1 relative flex-col justify-center px-3.5 bg-[#1919194D]`}
        >
          <TouchableOpacity
            onPress={onClose}
            style={tw.style(`absolute top-0 right-0 z-50`, {
              paddingTop: insets.top + 12,
              paddingRight: 12 + insets.right,
            })}
            activeOpacity={0.7}
          >
            <View style={tw`h-[36px] w-[36px] flex-col items-center justify-center bg-black rounded-full`}>
              <AntDesign name="close" size={22} color="white" />
            </View>
          </TouchableOpacity>

          <View
            style={tw`flex-col justify-center items-center p-7 gap-y-5 h-[514px] bg-white rounded-[12px]`}
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
              Payment Received
            </Text>

            <Text
              style={tw.style(`text-base text-[#A0A0A0] text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Driver accepted your Change Request, your balance has been added
              to your Wallet
            </Text>

            <TouchableOpacity
              style={tw`self-start w-full mt-5 py-3.5 bg-base-green rounded-[8px]`}
            >
              <Text
                style={tw.style(`text-base text-center text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Back Home
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </Modal>
  );
};

export default PaymentReceived;
