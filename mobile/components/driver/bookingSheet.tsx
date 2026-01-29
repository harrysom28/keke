import {
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { COMPLETE_BOOKED_RIDE, START_BOOKED_RIDE } from "@/constants";
import React, { useContext, useState } from "react";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { Entypo } from "@expo/vector-icons";
import { Portal } from "@gorhom/portal";
import { TBooking } from "@/types";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";

function isBookingValid(booking_date: string, booking_time: string) {
  // Get current date and time
  const now = new Date();

  // Get today's date in "YYYY-MM-DD" format
  const today = now.toISOString().split("T")[0];

  // Combine today's date and booking time to create a Date object
  const bookingDateTime = new Date(`${booking_date}T${booking_time}`);

  // Check if the booking date is today and the booking time is now or past
  return booking_date === today && now >= bookingDateTime;
}

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  action?: (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  cancel: (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  viewBooking: (booking_id: string) => void;
  data: Partial<TBooking>;
  isloading: boolean;
  accepted?: boolean;
}

export const DriverBookingSheet = ({
  bottomSheetRef,
  action = () => {},
  cancel,
  data,
  isloading,
  accepted = false,
  viewBooking,
}: Props) => {
  const { apiConfig } = useContext(AppContext);
  const { user } = useSelector(AuthState);
  const [accept, setAccept] = useState(false);
  const [reject, setReject] = useState(false);
  const [ride, setRide] = useState(false);
  const isDriver = user?.profile?.role === "driver";

  const BookingAction = (booking_id: string) => {
    const URL = isDriver ? COMPLETE_BOOKED_RIDE : START_BOOKED_RIDE;

    setRide(true);
    axios
      .post(URL, { booking_id }, apiConfig)
      .then(() => {
        viewBooking(booking_id);
      })
      .catch((err) => {
        console.log(err?.response?.data);
        // Silently handle 404 errors (driver profile not found, booking not found, etc.)
        if (err?.response?.status === 404) {
          console.log('Resource not found (404) - silently handling');
          return;
        }
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => setRide(false));
  };

  return (
    <Portal>
      <BottomSheet
        height={"82%"}
        ref={bottomSheetRef}
        animationType="spring"
        backdropMaskColor="#19191933"
        openDuration={1000}
        disableKeyboardHandling={true}
        style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`}
      >
        {isloading ? (
          <ActivityIndicator color={tw.color("base-green")} size={"large"} />
        ) : (
          <View>
            <View
              style={tw`flex-row items-center justify-between px-4 py-2 bg-black rounded-t-[16px]`}
            >
              <View style={tw`flex-row items-center gap-x-4`}>
                <Image
                  source={{
                    uri: isDriver && !accepted 
                      ? (data?.image || data?.passenger_image) // Driver viewing passenger
                      : (accepted && data?.driver_image ? data?.driver_image : data?.image),
                  }}
                  style={tw`h-[48px] w-[48px] rounded-full`}
                />
                <View>
                  <Text
                    style={tw.style(`text-[20px] text-white`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {isDriver && !accepted
                      ? (data?.username || data?.name || data?.passenger_name || "Passenger") // Driver viewing passenger
                      : (accepted && data?.driver_name ? data?.driver_name : data?.username)}
                  </Text>
                  {isDriver && !accepted && (
                    <Text
                      style={tw.style(`text-xs text-gray-300 mt-1`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Ride Request
                    </Text>
                  )}
                  {accepted && data?.driver_id && (
                    <Text
                      style={tw.style(`text-xs text-gray-300 mt-1`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Driver Assigned
                    </Text>
                  )}
                </View>
              </View>
              <Text
                style={tw.style(`text-xl text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                ₦{(() => {
                  // Handle cost as number, string, or fare object
                  if (typeof data?.cost === 'number') {
                    return data.cost.toLocaleString();
                  } else if (typeof data?.cost === 'string') {
                    const numCost = parseFloat(data.cost);
                    return isNaN(numCost) ? '0' : numCost.toLocaleString();
                  } else if (data?.cost && typeof data.cost === 'object') {
                    // If cost is a fare object, use totalFare
                    const fareObj = data.cost as any;
                    if (fareObj.totalFare !== undefined) {
                      return typeof fareObj.totalFare === 'number' 
                        ? fareObj.totalFare.toLocaleString()
                        : parseFloat(fareObj.totalFare || '0').toLocaleString();
                    }
                  }
                  // Fallback to fare field if cost is not available
                  if (data?.fare) {
                    return typeof data.fare === 'number'
                      ? data.fare.toLocaleString()
                      : parseFloat(String(data.fare || '0')).toLocaleString();
                  }
                  return '0';
                })()}
              </Text>
            </View>

            <View style={tw`flex-row gap-x-4 my-8`}>
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
                    Pick up
                  </Text>
                  <Text
                    style={tw.style(`text-xs text-[#242E42] w-[90%]`, {
                      fontFamily: "RobotoRegular",
                    })}
                    numberOfLines={3}
                  >
                    {(() => {
                      const pickup = data?.pickup_location || '';
                      if (!pickup || pickup.trim() === '') return "Pickup location";
                      const lowerPickup = pickup.toLowerCase();
                      // Only filter out clear placeholders
                      if (lowerPickup.includes('select') || 
                          (lowerPickup.includes('current location') && lowerPickup.includes('accuracy'))) {
                        return "Pickup location";
                      }
                      return pickup;
                    })()}
                  </Text>
                </View>
                <View style={tw`relative mt-3`}>
                  <View
                    style={tw`flex-row items-center justify-between w-[80%]`}
                  >
                    <Text
                      style={tw.style(`text-base text-[#5A5A5A]`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Drop-off
                    </Text>
                  </View>
                  <Text
                    numberOfLines={3}
                    style={tw.style(`text-xs text-[#242E42] w-[90%]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    {(() => {
                      const dropoff = data?.dropoff_location || '';
                      if (!dropoff || dropoff.trim() === '') return "Drop-off location";
                      const lowerDropoff = dropoff.toLowerCase();
                      // Only filter out clear placeholders
                      if (lowerDropoff.includes('select') || 
                          (lowerDropoff.includes('current location') && lowerDropoff.includes('accuracy'))) {
                        return "Drop-off location";
                      }
                      return dropoff;
                    })()}
                  </Text>
                </View>
              </View>
            </View>
            <View style={tw`flex-row items-center justify-between mx-1.5`}>
              <Text
                style={tw.style(`text-sm text-[#5A5A5A]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Schedule
              </Text>
              <Text
                style={tw.style(`text-base text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {!!data?.booking_date && formatBookingDate(data?.booking_date)}{" "}
                {!!data?.booking_time && formatBookingTime(data?.booking_time)}
              </Text>
            </View>
            {/* Passenger Details Section - Show when driver is viewing a booking request */}
            {isDriver && !accepted && (
              <View style={tw`bg-[#F5F5F5] rounded-[12px] p-4 mx-1.5 my-3`}>
                <Text
                  style={tw.style(`text-base text-[#5A5A5A] mb-3`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Passenger Details
                </Text>
                <View style={tw`flex-row items-center gap-x-3`}>
                  {(data?.image || data?.passenger_image) && (
                    <Image
                      source={{
                        uri: data?.image || data?.passenger_image,
                      }}
                      style={tw`h-[50px] w-[50px] rounded-full`}
                    />
                  )}
                  <View style={tw`flex-1`}>
                    <Text
                      style={tw.style(`text-base text-[#242E42]`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      {data?.username || data?.name || data?.passenger_name || "Passenger"}
                    </Text>
                    {(data as any)?.phone && (
                      <Text
                        style={tw.style(`text-sm text-[#666] mt-1`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        {(data as any).phone}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            {/* Driver Information Section - Show when driver has accepted */}
            {accepted && data?.driver_id && (
              <View style={tw`bg-[#F5F5F5] rounded-[12px] p-4 mx-1.5 my-3`}>
                <Text
                  style={tw.style(`text-base text-[#5A5A5A] mb-3`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Driver Details
                </Text>
                <View style={tw`flex-row items-center gap-x-3 mb-3`}>
                  <Image
                    source={{
                      uri: data?.driver_image || data?.image,
                    }}
                    style={tw`h-[50px] w-[50px] rounded-full`}
                  />
                  <View style={tw`flex-1`}>
                    <Text
                      style={tw.style(`text-base text-[#242E42]`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      {data?.driver_name || data?.username || "Driver"}
                    </Text>
                    {data?.driver_phone && (
                      <Text
                        style={tw.style(`text-sm text-[#666] mt-1`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        {data?.driver_phone}
                      </Text>
                    )}
                    <View style={tw`flex-row items-center gap-x-2 mt-1`}>
                      {data?.driver_rating && (
                        <View style={tw`flex-row items-center`}>
                          <Text
                            style={tw.style(`text-sm text-[#FDBC14]`, {
                              fontFamily: "RobotoBold",
                            })}
                          >
                            ⭐ {parseFloat(String(data.driver_rating)).toFixed(1)}
                          </Text>
                          {(data as any)?.driver_rating_count && (
                            <Text
                              style={tw.style(`text-xs text-[#666] ml-1`, {
                                fontFamily: "RobotoRegular",
                              })}
                            >
                              ({(data as any).driver_rating_count})
                            </Text>
                          )}
                        </View>
                      )}
                      {(data as any)?.driver_total_rides && (
                        <Text
                          style={tw.style(`text-xs text-[#666]`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          • {(data as any).driver_total_rides} rides
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
                {data?.vehicle_type && (
                  <View style={tw`mt-2 pt-3 border-t border-[#E0E0E0]`}>
                    <Text
                      style={tw.style(`text-xs text-[#666] mb-1`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Vehicle Type
                    </Text>
                    <Text
                      style={tw.style(`text-sm text-[#242E42]`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      {data?.vehicle_type}
                    </Text>
                  </View>
                )}
                <View style={tw`mt-2 pt-3 border-t border-[#E0E0E0]`}>
                  <View style={tw`flex-row items-center justify-between`}>
                    {data?.vehicle_number && (
                      <View style={tw`flex-1`}>
                        <Text
                          style={tw.style(`text-xs text-[#666] mb-1`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          Plate Number
                        </Text>
                        <Text
                          style={tw.style(`text-sm text-[#242E42]`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          {data.vehicle_number}
                        </Text>
                      </View>
                    )}
                    {(data as any)?.driver_union_number && (
                      <View style={tw`flex-1 ml-3`}>
                        <Text
                          style={tw.style(`text-xs text-[#666] mb-1`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          Union Number
                        </Text>
                        <Text
                          style={tw.style(`text-sm text-[#242E42]`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          {(data as any).driver_union_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
            <View style={tw`flex-row items-center justify-between mx-1.5 my-3`}>
              <Text
                style={tw.style(`text-sm text-[#5A5A5A]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Payment
              </Text>
              <Text
                style={tw.style(`text-base text-[#5A5A5A] capitalize`, {
                  fontFamily: "RobotoBold",
                })}
              >
                {data?.payment_method}
              </Text>
            </View>
            <View style={tw.style(`flex-col gap-y-4`, accepted && `mt-12`)}>
              {/* Accept Ride button - only for drivers viewing unaccepted bookings */}
              {!accepted && isDriver && (
                <TouchableOpacity
                  onPress={() => action(data?.booking_id as string, setAccept)}
                  style={tw`flex-row items-center justify-center gap-x-2 py-3.5 bg-base-green rounded-[8px]`}
                >
                  {accept ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-base text-white uppercase`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      Accept ride
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Accepted booking actions */}
              {accepted && isBookingValid(
                data?.booking_date as string,
                data?.booking_time as string
              ) && (
                <>
                  {/* Complete Ride button - only for drivers */}
                  {isDriver && (
                    <TouchableOpacity
                      onPress={() => BookingAction(data?.booking_id as string)}
                      style={tw`flex-row items-center justify-center gap-x-2 py-3.5 bg-base-green rounded-[8px]`}
                    >
                      {ride ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text
                          style={tw.style(`text-base text-white uppercase`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          Complete Ride
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Start Ride button - only for passengers when ride hasn't started */}
                  {!isDriver && !data?.is_started && (
                    <TouchableOpacity
                      onPress={() => BookingAction(data?.booking_id as string)}
                      style={tw`flex-row items-center justify-center gap-x-2 py-3.5 bg-base-green rounded-[8px]`}
                    >
                      {ride ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text
                          style={tw.style(`text-base text-white uppercase`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          Start Ride
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Cancel button - only for drivers when accepted */}
                  {isDriver && cancel && (
                    <TouchableOpacity
                      onPress={() => cancel(data?.booking_id as string, setReject)}
                      style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-red-400 rounded-[8px]`}
                    >
                      {reject ? (
                        <ActivityIndicator color={tw.color("text-red-400")} />
                      ) : (
                        <Text
                          style={tw.style(`text-base text-red-400 uppercase`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          Cancel Ride
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Cancel button for passengers to cancel their booking */}
              {!isDriver && cancel && (
                <TouchableOpacity
                  onPress={() => cancel(data?.booking_id as string, setReject)}
                  style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-red-400 rounded-[8px]`}
                >
                  {reject ? (
                    <ActivityIndicator color={tw.color("text-red-400")} />
                  ) : (
                    <Text
                      style={tw.style(`text-base text-red-400 uppercase`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      Cancel Booking
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </BottomSheet>
    </Portal>
  );
};
