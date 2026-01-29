import {
  BackHandler,
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
          onChangeText={onChange}
          value={value}
          editable={editable}
        />
      </View>
    </View>
  );
};

interface Props {
  action: () => void;
}

const RequestChangeSheet = ({ action }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const isFocused = useIsFocused();
  const [state, setState] = useState({});
  // useEffect(() => {
  //   if (isFocused) {
  //     // setLoading(true);
  //     // console.log(apiConfig);
  //     axios
  //       .get(RETRIEVE_CHANGE, apiConfig)
  //       .then(({ data }) => {
  //         console.log(data?.data), "rch";

  //         // setData(data?.data);
  //       })
  //       .catch((err) => {
  //         console.log(err?.response?.data, "rcher");
  //         if (err?.response?.data?.message) {
  //           showMessage({
  //             type: "danger",
  //             message: err?.response?.data.message,
  //           });
  //         } else if (err?.response?.data?.error) {
  //           showMessage({
  //             type: "danger",
  //             message: err?.response?.data.error,
  //           });
  //         } else {
  //           showMessage({
  //             type: "danger",
  //             message: "Something went wrong! Check your internet connection",
  //           });
  //         }
  //       });
  //     // .finally(() => setLoading(false));
  //   }
  // }, [isFocused]);

  return (
    <View>
      <View
        style={tw.style(
          `flex-row items-center bg-[#F6F6F6] w-[99%] py-3 px-4 mb-6 rounded-t-[16px]`,
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
          style={tw.style(`basis-[88%] text-center text-xl text-[#242E42]`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Request Change
        </Text>
        <TouchableOpacity
          // onPress={handleBack}
          style={tw`h-[39px] w-[39px] flex-col items-center justify-center bg-black p-1 rounded-full`}
        >
          <AntDesign name="close" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={tw`flex-col gap-y-3`}>
        <ListItem label="Ride Charge" value="₦15,901" />
        <ListItem label="Amount paid in Cash/Coupon" value="₦" editable />
        <ListItem label="Balance" value="₦" />
      </View>
      <Pressable
        // onPress={() =>
        //   dispatch(setAppData({ isBooking: false, hasBookedRide: true }))
        // }
        style={tw`mt-14 bg-base-green py-4 rounded`}
      >
        <Text
          style={tw.style(`text-base text-center text-white`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Request
        </Text>
      </Pressable>
    </View>
  );
};

export default RequestChangeSheet;
