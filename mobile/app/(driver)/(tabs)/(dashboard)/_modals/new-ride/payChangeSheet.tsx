import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Path, Svg } from "react-native-svg";
import React, { useCallback, useContext, useEffect, useState } from "react";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { RETRIEVE_CHANGE } from "@/constants";
import axios from "axios";
import { setAppData } from "@/store/AppSlice";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (text: string) => void;
}

const ListItem = ({ label, value, editable = false, onChange }: LProps) => {
  return (
    <View>
      <Text
        style={tw.style(`text-sm mb-1`, {
          fontFamily: "RobotoMedium",
        })}
      >
        {label}
      </Text>
      <View style={tw`relative h-[45px]`}>
        <TextInput
          style={tw.style(
            `px-4 h-full text-base text-black border border-[#B8B8B8] rounded-[8px]`,
            {
              fontFamily: "RobotoBold",
            }
          )}
          keyboardType="numeric"
          onChangeText={onChange}
          value={value}
          editable={editable}
        />
      </View>
    </View>
  );
};

interface Props {
  onClose: () => void;
  show: boolean;
  handlePay: (amount: string) => void;
  data: object;
  loading: boolean;
}

const RequestChangeModal = ({
  onClose,
  show,
  handlePay,
  data,
  loading,
}: Props) => {
  const { apiConfig } = useContext(AppContext);
  const isFocused = useIsFocused();
  const [amount, setAmount] = useState<string>("0");

  const balance = parseFloat(amount) - parseFloat(data?.cost);

  return (
    <Modal
      style={tw`flex-1`}
      visible={show}
      transparent
      onRequestClose={onClose}
    >
      <View style={tw`flex-1 flex-col justify-end bg-[#1919194D]`}>
        <View style={tw`bg-white px-6 py-10 h-[68%] rounded-t-[40px]`}>
          <View
            style={tw.style(
              `flex-row items-center justify-between bg-[#F6F6F6] w-[99%] py-3 px-4 mb-6 rounded-t-[16px]`,
              {
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 3,
                },
                shadowOpacity: 0.25,
                shadowRadius: 2.84,
                elevation: 5,
              }
            )}
          >
            <Text
              style={tw.style(`text-xl text-[#242E42]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Pay Change
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={tw`h-[35px] w-[35px] flex-col items-center justify-center bg-black p-1 rounded-full`}
            >
              <AntDesign name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View style={tw`flex-col gap-y-3`}>
            <ListItem label="Ride Charge" value={data?.cost} />
            <ListItem
              label="Amount paid in Cash/Coupon"
              value={amount}
              onChange={(text) => setAmount(text)}
              editable
            />
            <ListItem label="Balance" value={`${balance}`} />
          </View>
          <TouchableOpacity
            disabled={parseFloat(amount) <= parseFloat(data?.cost)}
            onPress={() => handlePay(`${balance}`)}
            style={tw`mt-14 bg-base-green py-4 rounded`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-base text-center text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Pay
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default RequestChangeModal;
