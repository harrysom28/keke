import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppDetailsState, setSubscriptionUtils } from "@/store/AppSlice";
import {
  CLOSEST_BOOKING,
  DRIVER_ACTIVE_RIDE,
  DRIVER_BOOKING_ID,
  DRIVER_CANCEL_BOOKING,
  DRIVER_EARNINGS,
} from "@/constants";
import { Defs, Line, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import React, { useContext, useEffect, useRef, useState } from "react";
import { TBooking, TDriverActiveRide, TDriverStats } from "@/types";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmergencyModal from "@/app/(app)/(tabs)/(home)/_modals/emergencyModal";
import { Portal } from "@gorhom/portal";
import axios from "axios";
import { getGreeting } from "@/lib/getGreeting";
import { router } from "expo-router";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import usePusherChannel from "@/hooks/usePusherChannel";

const Home = () => {
  const { apiConfig } = useContext(AppContext);
  const isFocused = useIsFocused();
  const { subscription } = useSelector(AppDetailsState);
  const [activeRide, setActiveRide] = useState<Partial<TDriverActiveRide>>({});
  const [booking, setBooking] = useState<Partial<TBooking>>({});
  const [viewbooking, setViewbooking] = useState<Partial<TBooking>>({});
  const [rloading, setRLoading] = useState(false);
  const [vloading, setVLoading] = useState(false);
  const [changed, setChange] = useState(false);
  const [activity, setActivity] = useState<Partial<TDriverStats>>({});
  const { user } = useSelector(AuthState);
  const dispatch = useDispatch();

  const emergencySheetRef = useRef<BottomSheetMethods>(null);
  const bookingSheetRef = useRef<BottomSheetMethods>(null);

  const leftValue = useRef(new Animated.Value(0)).current;

  const Animate = () => {
    Animated.loop(
      Animated.timing(leftValue, {
        toValue: 280, // New position for `x`
        duration: 3500, // Animation duration in ms
        useNativeDriver: false, // Set to `false` for layout properties like `x`
      }),
      { iterations: -1 } // Infinite iterations
    ).start();
  };

  useEffect(() => {
    if (isFocused) {
      axios
        .get(DRIVER_EARNINGS, apiConfig)
        .then(({ data }) => {
          setActivity(data?.data);
        })
        .catch((err) => {
          console.log('Driver earnings error:', err?.response?.data);
          const status = err?.response?.status || err?.status;
          
          // Silently handle 401 errors - token refresh should happen automatically via API client
          if (status === 401) {
            console.log('Authentication error (401) - token refresh should handle this');
            return;
          }
          
          // Silently handle 404 errors (driver profile not found, etc.)
          if (status === 404) {
            console.log('Resource not found (404) - silently handling');
            return;
          }
          
          // Use centralized error handler to extract safe string message
          const errorMessage = getErrorMessage(err);
          safeShowMessage({
            type: "danger",
            message: errorMessage,
          });
        });
    }
  }, [isFocused]);

  const getClosestBooking = () => {
    axios
      .get(CLOSEST_BOOKING, apiConfig)
      .then(({ data }) => {
        if (data?.data?.length > 0) {
          setBooking(data?.data[0]);
        } else {
          setBooking({});
        }
      })
      .catch((err) => {
        console.log('Closest booking error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          return;
        }
        
        // Silently handle 404 errors (no bookings available, driver profile not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          setBooking({});
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  };

  useEffect(() => {
    if (isFocused) {
      getClosestBooking();
    }
  }, [isFocused, changed]);

  const getActiveRide = () => {
    axios
      .get(DRIVER_ACTIVE_RIDE, apiConfig)
      .then(({ data }) => {
        setActiveRide(data?.data);
      })
      .catch((err) => {
        console.log('Active ride error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          setActiveRide({});
          return;
        }
        
        // Silently handle 404 errors (no active ride, driver profile not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          setActiveRide({});
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        setActiveRide({});
      });
  };

  useEffect(() => {
    if (isFocused) {
      Animate();
      getActiveRide();
      // .finally(() => setLoading(false));
    }
  }, [isFocused]);

  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    axios
      .post(DRIVER_CANCEL_BOOKING, { booking_id }, apiConfig)
      .then(() => {
        bookingSheetRef?.current?.close();
        setViewbooking({});
        setChange((prev) => !prev);
      })
      .catch((err) => {
        console.log('Cancel booking error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => loading(false));
  };

  const ViewBooking = (booking_id: string) => {
    bookingSheetRef?.current?.open();
    setVLoading(true);
    axios
      .get(DRIVER_BOOKING_ID + booking_id + "/booking", apiConfig)
      .then(({ data }) => {
        const bookingData = data?.data || {};
        
        // Extract pickup location - try multiple sources
        let pickupLocation = '';
        const pickupSources = [
          bookingData.pickup?.address,
          bookingData.pickup_location,
          bookingData.pickup?.name,
          bookingData.pickup?.location?.address,
          bookingData.pickup?.location?.name,
          bookingData.origin,
        ];
        
        for (const source of pickupSources) {
          if (source && typeof source === 'string' && source.trim() !== '') {
            const lowerSource = source.toLowerCase();
            if (!lowerSource.includes('select') && 
                !(lowerSource.includes('current location') && lowerSource.includes('accuracy'))) {
              pickupLocation = source.trim();
              break;
            }
          }
        }
        
        // Extract dropoff location - try multiple sources
        let dropoffLocation = '';
        const dropoffSources = [
          bookingData.dropoff?.address,
          bookingData.dropoff_location,
          bookingData.dropoff?.name,
          bookingData.dropoff?.location?.address,
          bookingData.dropoff?.location?.name,
          bookingData.destination,
        ];
        
        for (const source of dropoffSources) {
          if (source && typeof source === 'string' && source.trim() !== '') {
            const lowerSource = source.toLowerCase();
            if (!lowerSource.includes('select') && 
                !(lowerSource.includes('current location') && lowerSource.includes('accuracy'))) {
              dropoffLocation = source.trim();
              break;
            }
          }
        }
        
        // Extract passenger info
        const passengerName = bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || 'Passenger';
        const passengerImage = bookingData.passenger?.profileImage || bookingData.passenger?.image || bookingData.rider?.profileImage || bookingData.rider?.image || null;
        const passengerPhone = bookingData.passenger?.phone || bookingData.rider?.phone || bookingData.phone || null;
        
        // Parse scheduled_at date
        const scheduledAt = bookingData.scheduled_at ? new Date(bookingData.scheduled_at) : null;
        const bookingDate = scheduledAt ? scheduledAt.toISOString().split('T')[0] : (bookingData.booking_date || '');
        const bookingTime = scheduledAt ? scheduledAt.toTimeString().split(' ')[0].substring(0, 5) : (bookingData.booking_time || '');
        
        setViewbooking({
          ...bookingData,
          booking_id,
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          origin: pickupLocation,
          destination: dropoffLocation,
          booking_date: bookingDate,
          booking_time: bookingTime,
          username: passengerName,
          name: passengerName,
          image: passengerImage,
          passenger_image: passengerImage,
          passenger_name: passengerName,
          phone: passengerPhone,
        });
      })
      .catch((err) => {
        console.log('View booking error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          bookingSheetRef?.current?.close();
          return;
        }
        
        // Silently handle 404 errors (booking not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          bookingSheetRef?.current?.close();
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        bookingSheetRef?.current?.close();
      })
      .finally(() => setVLoading(false));
  };

  usePusherChannel({
    channel: `private-passenger_cancelled`,
    visible: !subscription.passenger_cancelled,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ passenger_cancelled: true }));
    },
    onEvent: (event) => {
      console.log(`Event received: ${event}`);
      safeShowMessage({
        type: "danger",
        message: "Passenger has cancelled the ride",
      });
      getActiveRide();
      getClosestBooking();
    },
  });

  return (
    <>
      <DriverBookingSheet
        bottomSheetRef={bookingSheetRef}
        data={viewbooking}
        isloading={vloading}
        accepted={!!viewbooking?.driver_id || viewbooking?.status === 'accepted'}
        cancel={(booking_id, loading) => CancelBooking(booking_id, loading)}
        viewBooking={(booking_id) => ViewBooking(booking_id)}
        accepted
      />
      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
          paddingTop: StatusBar.currentHeight,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="dark-content" />
        <View
          style={tw.style(
            `flex-row items-center justify-between px-4 h-[52px] bg-black`
          )}
        >
          <Text
            style={tw.style(`text-[18px] text-white`, {
              fontFamily: "RobotoBold",
            })}
          >
            {getGreeting()}{" "}
            {user && user?.profile?.name
              ? user?.profile?.name.split(" ")[0]
              : ""}
          </Text>
          <View style={tw.style(`flex-row items-center gap-x-5`)}>
            <TouchableOpacity
              onPress={() => emergencySheetRef?.current?.open()}
            >
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M13 1H11V3H9V5H7V7H5V9H3V11H1V13H3V15H5V17H7V19H9V21H11V23H13V21H15V19H17V17H19V15H21V13H23V11H21V9H19V7H17V5H15V3H13V1ZM13 3V5H15V7H17V9H19V11H21V13H19V15H17V17H15V19H13V21H11V19H9V17H7V15H5V13H3V11H5V9H7V7H9V5H11V3H13ZM13 7H11V13H13V7ZM13 15H11V17H13V15Z"
                  fill="white"
                />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/notifications")}>
              <MaterialCommunityIcons
                name="bell-badge-outline"
                size={24}
                color="white"
              />
            </TouchableOpacity>
          </View>
        </View>
        <View
          style={tw`flex-row justify-between items-center bg-[#3C8F7C33] px-4 py-2`}
        >
          <View style={tw`flex-row items-center gap-x-5`}>
            <Svg width={30} height={29} viewBox="0 0 30 29" fill="none">
              <Path
                d="M20 18.5C20 17.1187 16.0825 16 11.25 16M20 18.5C20 19.8813 16.0825 21 11.25 21C6.4175 21 2.5 19.8813 2.5 18.5M20 18.5V24.6713C20 26.095 16.0825 27.25 11.25 27.25C6.4175 27.25 2.5 26.0963 2.5 24.6713V18.5M20 18.5C24.78 18.5 28.75 17.2663 28.75 16V3.5M11.25 16C6.4175 16 2.5 17.1187 2.5 18.5M11.25 16C5.7275 16 1.25 14.7663 1.25 13.5V7.25M11.25 4.75C5.7275 4.75 1.25 5.86875 1.25 7.25M1.25 7.25C1.25 8.63125 5.7275 9.75 11.25 9.75C11.25 11.0163 15.3162 12.25 20.0962 12.25C24.8762 12.25 28.75 11.0163 28.75 9.75M28.75 3.5C28.75 2.11875 24.875 1 20.0962 1C15.3175 1 11.4425 2.11875 11.4425 3.5M28.75 3.5C28.75 4.88125 24.875 6 20.0962 6C15.3175 6 11.4425 4.88125 11.4425 3.5M11.4425 3.5V16.2075"
                stroke="#3C8F7C"
                strokeWidth={2}
              />
            </Svg>
            <View>
              <Text
                style={tw.style(`text-[14px] text-[#484C52]`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Today's Income
              </Text>
              <Text
                style={tw.style(`text-[20px] text-base-green`, {
                  fontFamily: "RobotoBlack",
                })}
              >
                ₦{activity?.earned_today}
              </Text>
            </View>
          </View>
          <View>
            <Text
              style={tw.style(`text-[14px] text-[#484C52]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Online
            </Text>
            <Text
              style={tw.style(`text-[16px] text-base-green`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {activity?.time_online ?? "00h 00mins"}
            </Text>
          </View>
        </View>

        <View style={tw`mt-6 px-4`}>
          <Text
            style={tw.style(`text-[16px] text-black`, {
              fontFamily: "RobotoBold",
            })}
          >
            Make Extra Money
          </Text>
          <View style={tw`flex-row justify-between items-center my-2`}>
            <Pressable style={tw`w-[48%]`}>
              <ImageBackground
                source={require(`@images/dchallenge.png`)}
                imageStyle={tw`rounded-[10px]`}
                style={tw`flex-col justify-end w-full h-[100px]`}
              >
                <Text
                  style={tw.style(`text-[16px] text-white p-2`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Daily Challenge
                </Text>
              </ImageBackground>
            </Pressable>
            <Pressable style={tw`w-[48%]`}>
              <ImageBackground
                source={require(`@images/schallenge.png`)}
                imageStyle={tw` rounded-[10px]`}
                style={tw`flex-col justify-end w-full h-[100px]`}
              >
                <Text
                  style={tw.style(`text-[16px] text-white p-2`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Schedule Challenge
                </Text>
              </ImageBackground>
            </Pressable>
          </View>

          <View
            style={tw.style(
              `flex-col gap-y-3 bg-white p-4 mt-4 rounded-[10px]`,
              {
                elevation: 4,
                display: Object.keys(activeRide).length > 0 ? "flex" : "none",
              }
            )}
          >
            <View style={tw`flex-row justify-between items-center w-full`}>
              <Text
                style={tw.style(`text-[14px] text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {activeRide?.arrival_distance}
              </Text>
              <Text
                style={tw.style(`text-[14px] text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {activeRide?.arrival_time}
              </Text>
            </View>
            <View style={tw`relative`}>
              <Svg width={"100%"} height={5} viewBox="0 0 310 5" fill="none">
                <Line
                  x1={2.12}
                  y1={2.88}
                  x2={307.88}
                  y2={2.87997}
                  stroke="url(#paint0_linear_538_5518)"
                  strokeWidth={4.24}
                  strokeLinecap="round"
                />
                <Defs>
                  <LinearGradient
                    id="paint0_linear_538_5518"
                    x1={310}
                    y1={5}
                    x2={1.49999}
                    y2={5}
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop stopColor="#3C8F7C" />
                    <Stop offset={1} stopOpacity={0.2} />
                  </LinearGradient>
                </Defs>
              </Svg>

              <Animated.View
                style={tw.style(`absolute  -top-[4.5px]`, {
                  transform: [{ translateX: -5 }], // Apply the translation on X-axis
                  left: leftValue,
                })}
              >
                <Svg width={19} height={15} viewBox="0 0 19 15" fill="none">
                  <Path
                    d="M17.8066 7.35302C17.8067 7.35307 17.8067 7.35313 17.8068 7.3532L1.2625 13.7162L1.26229 13.7163L1.26276 13.7151L3.71495 7.58962L3.80961 7.35317L3.71497 7.11671L1.26314 0.990265L17.8066 7.35302Z"
                    fill="#3C8F7C"
                    stroke="url(#paint0_linear_538_5521)"
                    strokeWidth={1.27263}
                  />
                  <Defs>
                    <LinearGradient
                      id="paint0_linear_538_5521"
                      x1={18.7066}
                      y1={7.35374}
                      x2={6.41295}
                      y2={-4.93989}
                      gradientUnits="userSpaceOnUse"
                    >
                      <Stop stopColor="#3C8F7C" />
                      <Stop offset={1} stopOpacity={0.2} />
                    </LinearGradient>
                  </Defs>
                </Svg>
              </Animated.View>
            </View>
          </View>

          {Object.keys(booking).length === 0 ? (
            <View
              style={tw.style(
                `flex-row items-center  p-4 rounded-[10px] my-2 bg-white`,
                {
                  elevation: 4,
                }
              )}
            >
              <Image
                source={require("@images/place-not-found.png")}
                style={tw.style(`w-[146px] h-[101px]`)}
              />
              <Text
                style={tw.style(`text-[15px] text-base-green`, {
                  fontFamily: "RobotoBold",
                })}
              >
                No Upcoming Schedule
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => ViewBooking(booking?.booking_id as string)}
              style={tw.style(
                `flex-row justify-between bg-white p-4 mt-4 rounded-[10px]`,
                {
                  // display: "none",
                  elevation: 4,
                }
              )}
            >
              <View>
                <Text
                  style={tw.style(`text-base text-[#484C52]`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Booking Date
                </Text>
                <Text
                  style={tw.style(`text-2xl text-base-green`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  {formatBookingDate(booking?.booking_date as string)}
                </Text>
                <TouchableOpacity
                  style={tw`px-4 py-1 mt-2.5 self-start border border-[#FF3810] rounded-[8px]`}
                  onPress={() =>
                    CancelBooking(booking?.booking_id as string, setRLoading)
                  }
                >
                  {rloading ? (
                    <ActivityIndicator color="#FF3810" />
                  ) : (
                    <Text
                      style={tw.style(`text-sm text-[#FF3810]`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      Tap to cancel
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={tw`basis-[40%]`}>
                <Text
                  style={tw.style(`text-[15px] text-[#484C52] text-right`, {
                    fontFamily: "RobotoBold",
                  })}
                  numberOfLines={2}
                >
                  {booking?.origin}
                </Text>
                <View
                  style={tw`flex-row items-center justify-end gap-x-1 mt-1`}
                >
                  <AntDesign
                    name="clockcircleo"
                    size={21}
                    color={tw.color("base-green")}
                  />
                  <Text
                    style={tw.style(`text-[15px] text-base-green text-right`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {formatBookingTime(booking?.booking_time as string)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View
          style={tw.style(
            `flex-col gap-y-2 absolute bottom-6 px-6 right-0 left-0 `
          )}
        >
          {Object.keys(activeRide).length > 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/home-map")}
              style={tw.style(
                `flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`
              )}
            >
              <Text
                style={tw.style(`text-base text-white`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Return to Ongoing Ride
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => router.push("/(dashboard)/home-map")}
                style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-white`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Passengers around you
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-black rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-black`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Schedule Pick-Up
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ImageBackground>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
    </>
  );
};

export default Home;
