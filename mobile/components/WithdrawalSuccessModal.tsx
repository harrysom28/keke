import {
  Image,
  Modal,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import React from "react";
import tw from "@/lib/tailwind";

type Props = {
  visible: boolean;
  amount?: number;
  onClose: () => void;
};

/**
 * Shown after a driver successfully submits a withdrawal request
 * (funds reserved; admin approval still pending).
 */
export function WithdrawalSuccessModal({ visible, amount, onClose }: Props) {
  const amountLabel =
    typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? `₦${amount.toLocaleString()}`
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1919194D" />
      <View
        style={tw`flex-1 relative flex-col justify-center px-3.5 bg-[#1919194D]`}
      >
        <View
          style={tw`flex-col justify-center items-center p-7 gap-y-5 bg-white rounded-[12px]`}
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
            Withdrawal requested
          </Text>

          {amountLabel ? (
            <Text
              style={tw.style(`text-3xl text-black text-center`, {
                fontFamily: "RobotoBlack",
              })}
            >
              {amountLabel}
            </Text>
          ) : null}

          <Text
            style={tw.style(`text-base text-[#A0A0A0] text-center`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Your withdrawal request has been submitted. Funds will be sent to
            your bank account after admin approval.
          </Text>

          <TouchableOpacity
            onPress={onClose}
            style={tw`self-start w-full mt-5 py-3.5 bg-base-green rounded-[8px]`}
            accessibilityRole="button"
            accessibilityLabel="Close withdrawal success"
          >
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default WithdrawalSuccessModal;
