import { AntDesign, Ionicons } from "@expo/vector-icons";
import {
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { Defs, Line, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import React, { RefObject, useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";

import { MapArrowSvg } from "@/svg";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

function ConfirmPayment({
  bottomSheetRef,
}: {
  bottomSheetRef: RefObject<BottomSheetMethods>;
}) {
  return (
    <View>
      <View
        style={tw`flex-row items-center justify-between px-4 py-4 bg-[#F6F6F6] rounded-t-[16px]`}
      >
        <Text
          style={tw.style(`text-[20px] text-[#242E42]`, {
            fontFamily: "RobotoBold",
          })}
        >
          Confirm Payment of
        </Text>

        <Text
          style={tw.style(`text-[24px] text-[#242E42]`, {
            fontFamily: "RobotoBold",
          })}
        >
          ₦2,050
        </Text>
      </View>

      <View style={tw.style(`flex-col gap-y-3 py-4 my-4 rounded-[10px]`)}>
        <Text
          style={tw.style(`text-[16px] text-black`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Once you receive payment, click the button
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => bottomSheetRef?.current?.close()}
        style={tw`flex-row items-center justify-center gap-x-2 py-4 bg-base-green rounded-[8px]`}
      >
        <Text
          style={tw.style(`text-base text-white uppercase`, {
            fontFamily: "RobotoBold",
          })}
        >
          Confirm Payment
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface Props {
  bottomSheetRef: RefObject<BottomSheetMethods>;
  display: "payment" | "change";
}

const Payment = ({ bottomSheetRef, display }: Props) => {
  const [height, setHeight] = useState<string>("60%");
  const isFocused = useIsFocused();

  const handleBack = () => {
    bottomSheetRef?.current?.close();
  };

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        handleBack();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => {
        backHandler.remove();
      };
    }, [])
  );

  useEffect(() => {
    if (isFocused) {
      if (display === "payment") {
        setHeight("43%");
      } else {
        setHeight("72%");
      }
    }
  }, [display, isFocused]);

  return (
    <BottomSheet
      height={height}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      disableBodyPanning={true}
      style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`}
    >
      {display === "payment" ? (
        <ConfirmPayment bottomSheetRef={bottomSheetRef} />
      ) : (
        <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ flexGrow: 0, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={tw`flex-row items-center justify-between px-4 py-4 bg-[#F6F6F6] rounded-t-[16px]`}
          >
            <Text
              style={tw.style(`text-[20px] text-[#242E42]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Change Request
            </Text>

            <TouchableOpacity onPress={() => bottomSheetRef?.current?.close()}>
              <AntDesign
                name="close"
                size={24}
                style={tw`p-1.5 bg-black rounded-full`}
                color="white"
              />
            </TouchableOpacity>
          </View>

          <Text
            style={tw.style(`text-[17px] my-5 text-center`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Current Passenger has requested for their balance pertaining to the
            Cash given or the worth of coupon used in the ride
          </Text>
          <View style={tw`flex-col gap-y-2`}>
            <View style={tw``}>
              <Text
                style={tw.style(`text-sm mb-1`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Ride Charge
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-1.5 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoMedium",
                  }
                )}
                editable={false}
                placeholder="₦99"
                placeholderTextColor="black"
              />
            </View>
            <View style={tw``}>
              <Text
                style={tw.style(`text-sm mb-1`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Requested Balance
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-1.5 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoMedium",
                  }
                )}
                placeholder="₦99"
                placeholderTextColor="black"
                editable={false}
              />
            </View>
          </View>
        </ScrollView>
        <View
          style={tw`border-t border-[#F0F0F0] pt-3 flex-col gap-y-4`}
          collapsable={false}
        >
          <TouchableOpacity
            style={tw`flex-row items-center justify-center gap-x-2 py-3.5 bg-base-green rounded-[8px] min-h-[48px]`}
            activeOpacity={0.85}
          >
            <Text
              style={tw.style(`text-base text-white uppercase`, {
                fontFamily: "RobotoBold",
              })}
            >
              Make Payment
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => bottomSheetRef?.current?.close()}
            style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-base-green rounded-[8px] min-h-[48px]`}
            activeOpacity={0.85}
          >
            <Text
              style={tw.style(`text-base text-base-green uppercase`, {
                fontFamily: "RobotoBold",
              })}
            >
              Appeal
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      )}
    </BottomSheet>
  );
};

export default Payment;
