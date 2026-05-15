import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Pressable as GesturePressable, TouchableOpacity } from "react-native-gesture-handler";
import { Path, Svg } from "react-native-svg";
import React, { useMemo, useState } from "react";

import { AntDesign } from "@expo/vector-icons";
import { WINDOW_WIDTH } from "@/constants/Metrics";
import { router } from "expo-router";
import tw from "@/lib/tailwind";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

/** Same as driver new-offer accept/decline — RN Pressable + hitSlop so taps work inside bottom sheets on small Android screens. */
const EMERGENCY_ACTION_HIT_SLOP = { top: 15, bottom: 15, left: 15, right: 15 } as const;

const EmergencyModal = ({ bottomSheetRef }: Props) => {
  const [show, setShow] = useState(false);
  const screenHeight = Dimensions.get("window").height;
  const sheetHeight = useMemo(
    () => Math.max(screenHeight * 0.3, Math.min(screenHeight * 0.5, screenHeight * 0.9)),
    [screenHeight]
  );

  return (
    <>
      {/* <Portal> */}
      <BottomSheet
        height={sheetHeight}
        ref={bottomSheetRef}
        disableKeyboardHandling={false}
        disableBodyPanning={true}
        style={tw`gap-y-4 pb-5 px-5 rounded-t-[40px] bg-white`}
        backdropMaskColor={tw.color(`bg-base-error bg-opacity-50`)}
        customDragHandleComponent={() => (
          <View
            style={tw.style(
              {
                width: WINDOW_WIDTH * 0.9,
              },
              `mt-5 mb-4 mx-6`
            )}
          >
            <Svg
              style={tw`self-center`}
              width="55"
              height="16"
              viewBox="0 0 55 16"
              fill="none"
            >
              <Path
                d="M48.0634 0.655518C50.2785 -0.233197 53.065 -0.121905 53.8831 1.58598C54.7012 3.29387 53.7999 5.48816 52.1208 6.60559L30.0286 14.58C28.0651 15.315 27.0771 15.2812 25.1336 14.58L3.04596 6.60559C1.51703 5.66321 0.14728 3.79647 1.15717 1.58598C2.16706 -0.624512 5.22807 -0.107953 7.16754 0.655518L27.5816 8.28898L48.0634 0.655518Z"
                fill="black"
              />
            </Svg>

            <TouchableOpacity
              onPress={() => bottomSheetRef?.current?.close()}
              style={tw`self-end -mt-4 bg-base-error px-1.5 py-1.5 rounded-full self-end`}
            >
              <AntDesign name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        )}
      >
        <View
          style={[
            tw`flex-col items-center gap-y-4 w-full`,
            Platform.OS === "android" ? { zIndex: 10, elevation: 12 } : null,
          ]}
        >
          <Text
            style={tw.style(`text-2xl text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Emergency Alert
          </Text>
          <Text
            style={tw.style(`text-base text-[#A0A0A0] text-center mb-2 px-1`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Your live location and your rider's contact have been sent to your
            emergency contacts.
          </Text>
          <View style={tw`w-[92%] max-w-[360px] self-center gap-y-3`}>
            <Pressable
              onPress={() => {
                Linking.openURL("tel:112").catch(() => {});
              }}
              hitSlop={EMERGENCY_ACTION_HIT_SLOP}
              style={({ pressed }) => [
                tw`min-h-[52px] w-full flex-row items-center justify-center rounded-[12px] bg-base-error px-4 py-3.5`,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text
                style={tw.style(`text-center text-base text-white`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Call the Police
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                bottomSheetRef?.current?.close();
                setShow(false);
                router.push("/(app)/setEmergencyContact");
              }}
              hitSlop={EMERGENCY_ACTION_HIT_SLOP}
              style={({ pressed }) => [
                tw`min-h-[52px] w-full flex-row items-center justify-center rounded-[12px] border border-base-error bg-white px-4 py-3.5`,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text
                style={tw.style(`text-center text-base text-base-error`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Send message
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
      {/* </Portal> */}
      <Modal
        visible={show}
        onRequestClose={() => setShow(false)}
        transparent
        animationType="slide"
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor={tw.color(`bg-base-error bg-opacity-50`)}
        />
        <TouchableWithoutFeedback onPress={() => setShow(false)}>
          <View
            style={tw.style(`relative bg-base-error bg-opacity-50`, {
              flex: 1,
            })}
          >
            <GesturePressable
              style={tw`flex-col items-center gap-y-4 pt-24 px-4 absolute top-[20%] left-6 right-6 h-[500px] bg-white rounded-[20px]`}
            >
              <Text
                style={tw.style(`text-2xl text-center`, {
                  fontFamily: "RobotoBold",
                })}
              >
                No Emergency Contact Found
              </Text>
              <TouchableOpacity
                onPress={() => {
                  bottomSheetRef?.current?.close();
                  setShow(false);
                  router.push("/(app)/setEmergencyContact");
                }}
              >
                <Text
                  style={tw.style(
                    `text-base text-base-error text-center mb-8`,
                    {
                      fontFamily: "RobotoBold",
                    }
                  )}
                >
                  Setup Emergency Contact
                </Text>
              </TouchableOpacity>
              <Image
                source={require("@/assets/images/emergency-not-found.png")}
                style={tw`self-center`}
              />
            </GesturePressable>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

export default EmergencyModal;
