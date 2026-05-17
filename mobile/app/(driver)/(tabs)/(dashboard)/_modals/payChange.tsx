import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import React, { RefObject, useContext, useState } from "react";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { PAY_CHANGE } from "@/constants";
import axios from "axios";
import { showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useCombinedSafeInsets, sheetFooterBottomPadding } from "@/hooks/useCombinedSafeInsets";

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
          keyboardType="numeric"
        />
      </View>
    </View>
  );
};

interface Props {
  bottomSheetRef: RefObject<BottomSheetMethods>;
  ride: object;
}

const PayChangeSheet = ({ ride, bottomSheetRef }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const insets = useCombinedSafeInsets();
  const footerPad = sheetFooterBottomPadding(insets.bottom);

  const handlePay = () => {
    setLoading(true);
    const data = { rideId: ride?.ride_id ?? ride?.rideId, amount };
    axios
      .post(PAY_CHANGE, data, apiConfig)
      .then(({ data }) => {
        console.log(data?.data), "rch";

        // setData(data?.data);
      })
      .catch((err) => {
        showErrorMessage(err, { fallback: "Could not record payment change. Please try again." });
      })
      .finally(() => setLoading(false));
  };

  return (
    <BottomSheet
      height={"60%"}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      disableBodyPanning={true}
      style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`}
    >
      <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ flexGrow: 0, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
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
            Pay Change
          </Text>
          <TouchableOpacity
            // onPress={handleBack}
            style={tw`h-[39px] w-[39px] flex-col items-center justify-center bg-black p-1 rounded-full`}
          >
            <AntDesign name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View style={tw`flex-col gap-y-3`}>
          <ListItem label="Ride Charge" value={`₦${ride?.cost}`} />
          <ListItem
            label="Amount paid in Cash"
            value=""
            editable
            onChange={(text) => {
              let val = parseFloat(ride?.cost) - parseFloat(text);
              setAmount(val.toLocaleString());
            }}
          />
          <ListItem label="Balance" value={`₦${amount}`} />
        </View>
      </ScrollView>
      <View
        style={[tw`border-t border-[#F0F0F0] pt-3`, { paddingBottom: footerPad }]}
        collapsable={false}
      >
        <Pressable
          onPress={handlePay}
          style={tw`bg-base-green py-4 rounded min-h-[48px] justify-center`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Make Payment
            </Text>
          )}
        </Pressable>
      </View>
      </View>
    </BottomSheet>
  );
};

export default PayChangeSheet;
