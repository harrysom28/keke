import { AntDesign, Entypo } from "@expo/vector-icons";
import { Image, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useContext, useEffect, useState } from "react";

import { AppContext } from "@/app/context";
import { AppDetailsState } from "@/store/AppSlice";
import { CONFIRM_RIDE } from "@/constants";
import { KeKe_Black_Svg } from "@/svg";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { getVehicleImageSource } from "@/utils/vehicleImages";

interface Props {
  action: () => void;
  back: () => void;
}
export const SelectedView = ({ back, action }: Props) => {
  const { ride } = useSelector(AppDetailsState);
  const { apiConfig } = useContext(AppContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const isFocused = useIsFocused();

  // Type-safe accessors for ride data
  const rideData = ride?.data as any;
  const rideUtils = ride?.utils as any;

  const handleConfirm = () => {
    setLoading(true);
    axios
      .post(CONFIRM_RIDE, apiConfig)
      .then(({ data }) => {
        console.log(data?.data);
        // setData(data?.data);
        // showMessage({
        //   type: "success",
        //   message: "Ride confirmed",
        // });
        // action();
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
        if (err?.response?.data?.error) {
          const errorMessage = typeof err?.response?.data?.error === 'string' 
            ? err.response.data.error 
            : (err.response.data.error?.message || err.response.data.message || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <View style={tw``}>
      <Pressable
        onPress={back}
        style={tw`h-[39px] w-[39px] absolute -top-8 right-0 z-10 flex-col items-center justify-center bg-black p-1 rounded-full`}
      >
        <AntDesign name="close" size={24} color="white" />
      </Pressable>
      <View style={tw`flex-row gap-x-4 mt-3`}>
        <View style={tw`flex-col items-center`}>
          <Entypo name="location-pin" size={28} color="#F44336" />
          <View
            style={tw.style(
              `h-[53px] border-l-2 border-dashed border-[#C8C7CC]`
            )}
          />
          <Entypo name="location-pin" size={28} color="black" />
        </View>

        <View style={tw`flex-col gap-y-3.5 basis-[100%]`}>
          <View style={tw`pb-3.5 border-b border-[#EFEFEF]`}>
            <Text
              style={tw.style(`text-base text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
              numberOfLines={1}
            >
              Current location
            </Text>
            <Text
              style={tw.style(`text-xs text-[#B8B8B8] w-[90%]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {rideData?.origin?.name}
            </Text>
          </View>
          <View style={tw`relative mt-3`}>
            <View style={tw`flex-row items-center justify-between w-[80%]`}>
              <Text
                style={tw.style(`text-base text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Destination
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={tw.style(`text-xs text-[#B8B8B8] w-[90%]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {rideData?.destination?.name}
            </Text>
          </View>
        </View>
      </View>
      <View style={tw`flex-row justify-center items-center gap-x-4 mt-9 mb-5`}>
        <Image
          source={
            rideUtils?.vehicle?.vehicle_type_image
              ? { uri: rideUtils.vehicle.vehicle_type_image }
              : getVehicleImageSource(
                  rideUtils?.vehicle?.vehicle_id || 1,
                  rideUtils?.vehicle?.vehicle_type_image,
                  rideUtils?.vehicle?.vehicle_type
                ).source ||
                require("@/assets/images/vehicle-1.png")
          }
          style={tw`h-[55px] w-[55px]`}
        />

        <Text
          style={tw.style(`text-base text-[#242E42]`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {rideUtils?.vehicle?.vehicle_type}
        </Text>
      </View>
      <TouchableOpacity
        onPress={action}
        style={tw`mt-10 bg-base-green py-4 rounded`}
      >
        <Text
          style={tw.style(`text-base text-center text-white`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Confirm ride
        </Text>
      </TouchableOpacity>
    </View>
  );
};
