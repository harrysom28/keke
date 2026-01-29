import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Path, Rect, Svg } from "react-native-svg";
import React, { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AppDetailsState } from "@/store/AppSlice";
import Checkbox from "expo-checkbox";
import { DRIVER_DETAILS } from "@/constants";
import DriverChatModal from "@/shared/modal/driverChat";
import { ScrollView } from "react-native-gesture-handler";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { timeAgo } from "@/lib/timeAgo";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  item: object;
  index: number;
}

const ListItem = ({ item, index }: LProps) => {
  return (
    <View
      style={tw.style(
        `flex-row gap-x-3.5`,
        index !== 0 && `border-t border-[#EBEBEB] pt-4-`
      )}
    >
      <Image
        source={{
          uri:
            item?.image ??
            `https://ui-avatars.com/api/?name=${item?.username}&background=4169E1&color=fff`,
        }}
        style={tw`h-[44px] w-[44px] rounded-full border border-zinc-100 bg-zinc-300`}
      />
      <View style={tw`w-[80%]`}>
        <View style={tw`flex-row justify-between`}>
          <View>
            <Text style={tw.style(`text-sm`, { fontFamily: "RobotoMedium" })}>
              {item?.username}
            </Text>
            <View style={tw`flex-row items-center gap-x-1`}>
              <AntDesign
                name={"star"}
                size={14}
                style={tw``}
                color={tw.color("base-green")}
              />
              <Text
                style={tw.style(`text-sm  text-[#6C6C70]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {item?.rating} ({item?.user_rating_count} ratings)
              </Text>
            </View>
          </View>

          <Text
            style={tw.style(`text-sm text-[#6C6C70]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {timeAgo(item?.date)}
          </Text>
        </View>
        <Text
          style={tw.style(`text-sm mt-2.5 text-[#6C6C70]`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {item?.review}
        </Text>
      </View>
    </View>
  );
};

interface Props {
  clear: () => void;
  back: () => void;
  isActive: boolean;
}

export const DriverInfoView = ({ clear, back, isActive = false }: Props) => {
  const { ride } = useSelector(AppDetailsState);
  const [chatModal, setChatModal] = useState<boolean>(false);
  const { apiConfig } = useContext(AppContext);
  const [data, setData] = useState({});
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      // console.log(ride?.utils);
      axios
        .post(DRIVER_DETAILS, { driver_id: ride?.utils?.driver_id }, apiConfig)
        .then(({ data }) => {
          console.log(data?.data);
          setData(data?.data?.driver);
          setReviews(data?.data?.reviews);
        })
        .catch((err) => {
          console.log(err?.response?.data, "drview");
          // Silently handle 404 errors (driver profile not found, etc.)
          if (err?.response?.status === 404) {
            console.log('Driver profile not found (404) - silently handling');
            return;
          }
          // Use centralized error handler to extract safe string message
          const { getErrorMessage } = require("@/utils/errorHandler");
          const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused]);

  return (
    <>
      <DriverChatModal
        data={{
          id: data?.driver_user_id,
          rideId: ride?.utils?.ride_id || ride?.ride_id,
          name: data?.name,
          image: data?.image,
        }}
        visible={chatModal}
        onClose={() => setChatModal(false)}
      />
      {loading && (
        <ActivityIndicator color={tw.color("base-green")} size="large" />
      )}
      <View
        style={tw.style(`pt-24`, {
          display: !loading && Object.keys(data).length === 0 ? "flex" : "none",
        })}
      >
        <Text
          style={tw.style(`text-xl text-center`, {
            fontFamily: "RobotoBold",
          })}
        >
          Driver Not Found
        </Text>
      </View>
      <View
        style={{
          display: !loading && Object.keys(data).length > 0 ? "flex" : "none",
        }}
      >
        <Pressable
          onPress={back}
          style={tw`h-[39px] w-[39px] absolute top-0 right-0 z-10 flex-col items-center justify-center bg-black p-1 rounded-full`}
        >
          <AntDesign name="close" size={24} color="white" />
        </Pressable>
        <View style={tw`flex-col items-center gap-y-1`}>
          <Image
            source={{
              uri: data?.image,
            }}
            style={tw`h-[72px] w-[72px] mb-3.5 self-center rounded-full`}
          />
          <Text
            style={tw.style(`text-xl text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            {data?.name}
          </Text>
          <Text
            style={tw.style(`text-sm text-center text-[#6C6C70]`, {
              fontFamily: "RobotoMedium",
            })}
          >
            {`${data?.vehicle_name}, ${data?.vehicle_color}, ${data?.licence_plate_number}`}
          </Text>
          {data?.union_number && (
            <Text
              style={tw.style(`text-sm text-center text-[#6C6C70]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              U/No: {data?.union_number}
            </Text>
          )}

          <View style={tw`flex-row items-center gap-x-1`}>
            <AntDesign
              name={"star"}
              size={14}
              style={tw``}
              color={tw.color("base-green")}
            />
            <Text
              style={tw.style(`text-sm text-center text-[#6C6C70]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {data?.rating}
            </Text>
            <Text
              style={tw.style(`text-xs text-center text-[#6C6C70]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              ({data?.reviews_count} ratings)
            </Text>
          </View>

          {isActive && (
            <View style={tw`flex-row items-center gap-x-5 mt-4`}>
              <TouchableOpacity
                onPress={() => setChatModal(true)}
                style={tw`flex-col items-center justify-center bg-base-green h-[50px] w-[50px] rounded-full`}
              >
                <Ionicons name="chatbubble-ellipses" size={28} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-col items-center justify-center bg-base-green h-[50px] w-[50px] rounded-full`}
                onPress={() => {
                  let num = data?.phone_number;
                  console.log(num);
                  if (num.startsWith("0")) {
                    Linking.openURL(`tel:${num}`);
                  } else {
                    Linking.openURL(`tel:+${num}`);
                  }
                }}
              >
                <Ionicons name="call-sharp" size={28} color="white" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={tw`flex-row items-center justify-between mt-4`}>
          <View style={tw`flex-row items-center gap-x-4`}>
            <View
              style={tw`flex-col items-center justify-center bg-[#F2F2F7] h-[36px] w-[36px] rounded-[8px]`}
            >
              <Ionicons name="navigate" size={20} color="black" />
            </View>
            <View>
              <Text
                style={tw.style(`text-base text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {data?.overall_distance}
              </Text>
              <Text
                style={tw.style(`text-sm text-center text-[#6C6C70]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Overall Distance
              </Text>
            </View>
          </View>
          <View style={tw`flex-row items-center gap-x-4`}>
            <View
              style={tw`flex-col items-center justify-center bg-[#F2F2F7] h-[36px] w-[36px] rounded-[8px]`}
            >
              <Svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                <Path
                  d="M17 5.82179H16.68L15.43 2.70179C15.2068 2.14705 14.8228 1.67168 14.3275 1.33669C13.8321 1.00171 13.248 0.822406 12.65 0.82179H6.65C5.95529 0.819801 5.28142 1.05898 4.74342 1.4985C4.20541 1.93802 3.83662 2.55064 3.7 3.23179L3.18 5.82179H3C2.20435 5.82179 1.44129 6.13786 0.87868 6.70047C0.316071 7.26308 0 8.02614 0 8.82179V11.8218C0 12.087 0.105357 12.3414 0.292893 12.5289C0.48043 12.7164 0.734784 12.8218 1 12.8218H2C2 13.6174 2.31607 14.3805 2.87868 14.9431C3.44129 15.5057 4.20435 15.8218 5 15.8218C5.79565 15.8218 6.55871 15.5057 7.12132 14.9431C7.68393 14.3805 8 13.6174 8 12.8218H12C12 13.6174 12.3161 14.3805 12.8787 14.9431C13.4413 15.5057 14.2044 15.8218 15 15.8218C15.7956 15.8218 16.5587 15.5057 17.1213 14.9431C17.6839 14.3805 18 13.6174 18 12.8218H19C19.2652 12.8218 19.5196 12.7164 19.7071 12.5289C19.8946 12.3414 20 12.087 20 11.8218V8.82179C20 8.02614 19.6839 7.26308 19.1213 6.70047C18.5587 6.13786 17.7956 5.82179 17 5.82179ZM11 2.82179H12.65C12.8486 2.82359 13.0421 2.88446 13.206 2.99666C13.3698 3.10886 13.4965 3.2673 13.57 3.45179L14.52 5.82179H11V2.82179ZM5.66 3.62179C5.70675 3.39251 5.83242 3.18689 6.01514 3.04072C6.19786 2.89454 6.42605 2.81707 6.66 2.82179H9V5.82179H5.22L5.66 3.62179ZM5 13.8218C4.80222 13.8218 4.60888 13.7631 4.44443 13.6533C4.27998 13.5434 4.15181 13.3872 4.07612 13.2045C4.00043 13.0217 3.98063 12.8207 4.01921 12.6267C4.0578 12.4327 4.15304 12.2545 4.29289 12.1147C4.43275 11.9748 4.61093 11.8796 4.80491 11.841C4.99889 11.8024 5.19996 11.8222 5.38268 11.8979C5.56541 11.9736 5.72159 12.1018 5.83147 12.2662C5.94135 12.4307 6 12.624 6 12.8218C6 13.087 5.89464 13.3414 5.70711 13.5289C5.51957 13.7164 5.26522 13.8218 5 13.8218ZM15 13.8218C14.8022 13.8218 14.6089 13.7631 14.4444 13.6533C14.28 13.5434 14.1518 13.3872 14.0761 13.2045C14.0004 13.0217 13.9806 12.8207 14.0192 12.6267C14.0578 12.4327 14.153 12.2545 14.2929 12.1147C14.4327 11.9748 14.6109 11.8796 14.8049 11.841C14.9989 11.8024 15.2 11.8222 15.3827 11.8979C15.5654 11.9736 15.7216 12.1018 15.8315 12.2662C15.9414 12.4307 16 12.624 16 12.8218C16 13.087 15.8946 13.3414 15.7071 13.5289C15.5196 13.7164 15.2652 13.8218 15 13.8218ZM18 10.8218H17.22C16.9388 10.5124 16.5961 10.2653 16.2138 10.0961C15.8315 9.92698 15.418 9.83961 15 9.83961C14.582 9.83961 14.1685 9.92698 13.7862 10.0961C13.4039 10.2653 13.0612 10.5124 12.78 10.8218H7.22C6.93882 10.5124 6.59609 10.2653 6.21378 10.0961C5.83148 9.92698 5.41805 9.83961 5 9.83961C4.58195 9.83961 4.16852 9.92698 3.78622 10.0961C3.40391 10.2653 3.06118 10.5124 2.78 10.8218H2V8.82179C2 8.55657 2.10536 8.30222 2.29289 8.11468C2.48043 7.92715 2.73478 7.82179 3 7.82179H17C17.2652 7.82179 17.5196 7.92715 17.7071 8.11468C17.8946 8.30222 18 8.55657 18 8.82179V10.8218Z"
                  fill="black"
                />
              </Svg>
            </View>
            <View>
              <Text
                style={tw.style(`text-base text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {data?.rides_count}
              </Text>
              <Text
                style={tw.style(`text-sm text-center text-[#6C6C70]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                All Rides
              </Text>
            </View>
          </View>
        </View>

        <View style={tw`mt-4`}>
          <View style={tw`flex-row items-center gap-x-1  mb-4`}>
            <Text
              style={tw.style(`text-xl text-center text-black`, {
                fontFamily: "RobotoBold",
              })}
            >
              Reviews
            </Text>
            <Text
              style={tw.style(`text-xs text-center text-[#6C6C70]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              ({data?.reviews_count} ratings)
            </Text>
          </View>

          <ScrollView
            style={tw.style(isActive ? `h-[40%]` : `h-[56%]`)}
            contentContainerStyle={tw`flex-col gap-y-4 pb-14`}
          >
            {reviews?.map((item, index) => (
              <ListItem key={item?.date} item={item} index={index} />
            ))}
          </ScrollView>
        </View>
      </View>
      {/* {!loading && isActive && Object.keys(data).length > 0 && (
        <Pressable
          onPress={clear}
          style={tw.style(
            `absolute bottom-10 left-6 right-6 bg-base-green py-4 rounded`
          )}
        >
          <Text
            style={tw.style(`text-base text-center text-white`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Cancel Ride
          </Text>
        </Pressable>
      )} */}
    </>
  );
};
