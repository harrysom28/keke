import "react-native-reanimated";

import { BackHandler, StatusBar, StyleSheet, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { AntDesign } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";

import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { DriverInfoView } from "@/components/find-ride/driverInfo";
import { TouchableOpacity } from "react-native-gesture-handler";
import { setAppData } from "@/store/AppSlice";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";
import { useFocusEffect } from "expo-router";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

const DriverSheet = ({ bottomSheetRef }: Props) => {
  const dispatch = useDispatch();
  const [rideStatus, setRideStatus] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);

  const handleBack = () => {
    bottomSheetRef?.current?.close();
    dispatch(
      setAppData({
        isBooking: false,
        ride: { status: false, data: {} },
      })
    );
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
    }, [step])
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior={"none"}
        style={[
          { backgroundColor: tw.color(`bg-transparent`) },
          StyleSheet.absoluteFillObject,
        ]}
        opacity={1}
      >
        <TouchableOpacity
          onPress={() => handleBack()}
          style={tw.style(`absolute top-0 right-0 z-50`, {
            paddingTop: (StatusBar.currentHeight || 0) + 4,
            paddingRight: 12,
          })}
          activeOpacity={0.7}
        >
          <View style={tw`h-[36px] w-[36px] flex-col items-center justify-center bg-black rounded-full`}>
            <AntDesign name="close" size={22} color="white" />
          </View>
        </TouchableOpacity>
      </BottomSheetBackdrop>
    ),
    [step]
  );

  return (
    <BottomSheet
      index={-1}
      snapPoints={["85%"]}
      ref={bottomSheetRef}
      style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] `}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
    >
      <DriverInfoView
        clear={() => {
          setStep(1);
          bottomSheetRef?.current?.close();
          dispatch(
            setAppData({
              isBooking: false,
              hasBookedRide: true,
              ride: { status: false, data: {} },
            })
          );
        }}
        back={() => setStep(6)}
        isActive
      />
    </BottomSheet>
  );
};

export default DriverSheet;
