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
import tw from "@/lib/tailwind";

interface Props {
  visible: boolean;
  view: "driver" | "passenger";
  onClose: () => void;
  action: () => void;
  cost: string;
}

const TripCompletedModal = ({
  visible,
  view,
  onClose,
  action,
  cost,
}: Props) => {
  const isPassenger = view === "passenger";
  return (
    <Modal visible={visible} transparent style={tw`flex-1`}>
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
              paddingTop: (StatusBar.currentHeight || 0) + 12,
              paddingRight: 12,
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
              source={require("@images/trip.png")}
              style={tw`w-[122px] h-[122px]`}
            />
            <Text
              style={tw.style(`text-2xl text-black text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Trip Completed
            </Text>
            {isPassenger ? (
              <>
                <Text
                  style={tw.style(`text-base text-[#242E42] text-center`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  You`ve arrived your location, pls wait for the driver to
                  confirm payment
                </Text>
                <View>
                  <Text
                    style={tw.style(`text-[15px] text-[#5A5A5A] text-center`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Trip Amount
                  </Text>
                  <Text
                    style={tw.style(`text-[34px] text-[#2A2A2A] text-center`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    ₦ {cost}
                  </Text>
                </View>
                <Text
                  style={tw.style(`text-base text-[#A0A0A0] text-center`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  This will take a few seconds
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={tw.style(`text-base text-[#242E42] text-center`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  Your Passenger has notified that trip is completed if payment
                  has been made, please confirm
                </Text>

                <View>
                  <Text
                    style={tw.style(`text-[15px] text-[#5A5A5A] text-center`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Trip Amount
                  </Text>
                  <Text
                    style={tw.style(`text-[34px] text-[#2A2A2A] text-center`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    ₦ {cost}
                  </Text>
                </View>
              </>
            )}
            {!isPassenger && (
              <TouchableOpacity
                onPress={action}
                style={tw`self-start w-full py-3.5 bg-base-green rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-center text-white`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Confirm Payment
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ImageBackground>
    </Modal>
  );
};

export default TripCompletedModal;
