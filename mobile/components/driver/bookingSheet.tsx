import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  DRIVER_COMPLETE_RIDE,
  DRIVER_START_RIDE,
  START_BOOKED_RIDE,
} from "@/constants";
import React, { useContext, useState } from "react";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { formatAddressForDisplay } from "@/utils/formatAddressForDisplay";
import { formatPhoneForDisplay } from "@/utils/phoneFormat";
import { Entypo } from "@expo/vector-icons";
import { Portal } from "@gorhom/portal";
import { TBooking } from "@/types";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";

type SheetBookingStage = "scheduled" | "searching" | "confirmed" | "ongoing" | "finished";

function isBookingValid(booking_date: string, booking_time: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  const bookingDateTime = new Date(`${booking_date}T${booking_time}`);
  return booking_date === today && now >= bookingDateTime;
}

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  action?: (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  cancel?: (
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
  const insets = useCombinedSafeInsets();
  const { apiConfig } = useContext(AppContext);
  const { user } = useSelector(AuthState);
  const [accept, setAccept] = useState(false);
  const [reject, setReject] = useState(false);
  const [ride, setRide] = useState(false);
  const isDriver = user?.profile?.role === "driver";

  const rawStatus = String(data?.status ?? "").trim().toLowerCase().replace(/-/g, "_");
  const isCancelled = rawStatus === "cancelled";
  const isCompleted = rawStatus === "completed";
  const isInProgressOrStarted =
    rawStatus === "in_progress" ||
    rawStatus === "in progress" ||
    rawStatus === "started" ||
    !!data?.is_started;
  const hasAssignedDriver =
    accepted ||
    !!data?.driver_id ||
    ["accepted", "in_progress", "in progress", "completed", "cancelled"].includes(rawStatus);

  const bookingStage: SheetBookingStage =
    rawStatus === "in_progress" || rawStatus === "in progress"
      ? "ongoing"
      : rawStatus === "accepted"
        ? "confirmed"
        : rawStatus === "pending" || rawStatus === "requested"
          ? "searching"
          : rawStatus === "completed" || rawStatus === "cancelled"
            ? "finished"
            : "scheduled";

  // Human-readable status label and colors for details page
  const statusConfig = (() => {
    switch (rawStatus) {
      case "cancelled":
        return { label: "Cancelled", bg: "#FEE2E2", text: "#B91C1C" };
      case "completed":
        return { label: "Completed", bg: "#D1FAE5", text: "#047857" };
      case "pending":
      case "requested":
        return { label: "Pending", bg: "#FEF3C7", text: "#B45309" };
      case "accepted":
        return { label: "Accepted", bg: "#DBEAFE", text: "#1D4ED8" };
      case "in_progress":
      case "in progress":
        return { label: "In progress", bg: "#DBEAFE", text: "#1D4ED8" };
      case "scheduled":
        return { label: "Scheduled", bg: "#F3F4F6", text: "#374151" };
      default:
        return rawStatus
          ? { label: rawStatus.replace(/_/g, " "), bg: "#F3F4F6", text: "#374151" }
          : null;
    }
  })();

  const statusDetails = (() => {
    switch (rawStatus) {
      case "cancelled":
        return {
          hint: "This booking was cancelled before pickup",
          accent: "#B91C1C",
          background: "#FEE2E2",
        };
      case "completed":
        return {
          hint: "This ride has already been completed",
          accent: "#047857",
          background: "#D1FAE5",
        };
      case "in_progress":
      case "in progress":
        return {
          hint: "The ride is ongoing right now",
          accent: "#2563EB",
          background: "#DBEAFE",
        };
      case "accepted":
        return {
          hint: "A driver has been assigned to this booking",
          accent: "#2E7D52",
          background: "#E8F5E9",
        };
      case "pending":
      case "requested":
        return {
          hint: "We are still matching this booking with a driver",
          accent: "#B45309",
          background: "#FEF3C7",
        };
      default:
        return {
          hint: "Your pickup time has been reserved",
          accent: "#0F9D8A",
          background: "#E7F7F3",
        };
    }
  })();
  const progressSteps = [
    { key: "scheduled", label: "Scheduled" },
    { key: "searching", label: "Matching" },
    { key: "confirmed", label: "Confirmed" },
    { key: "ongoing", label: "Ride" },
  ];
  const progressIndex =
    bookingStage === "scheduled"
      ? 0
      : bookingStage === "searching"
        ? 1
        : bookingStage === "confirmed"
          ? 2
          : 3;

  const handleCancelPress = () => {
    if (!cancel) return;
    if (isInProgressOrStarted) {
      showMessage({
        type: "warning",
        message: "This ride has already started and cannot be cancelled.",
      });
      return;
    }
    Alert.alert(
      isDriver ? "Cancel Ride" : "Cancel Booking",
      "Are you sure you want to cancel? This action cannot be undone.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => cancel(data?.booking_id as string, setReject),
        },
      ]
    );
  };

  const rideId = (data?.ride_id ?? data?.rideId ?? data?.booking_id) as string;

  const BookingAction = (booking_id: string, action: "start" | "complete") => {
    const URL =
      isDriver
        ? action === "start"
          ? DRIVER_START_RIDE
          : DRIVER_COMPLETE_RIDE
        : START_BOOKED_RIDE;
    const payload = isDriver ? { rideId: rideId || booking_id } : { booking_id };

    setRide(true);
    axios
      .post(URL, payload, apiConfig)
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
        disableKeyboardHandling={false}
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
                    uri: isDriver && !hasAssignedDriver 
                      ? (data?.image || data?.passenger_image) // Driver viewing passenger
                      : (hasAssignedDriver && data?.driver_image ? data?.driver_image : data?.image),
                  }}
                  style={tw`h-[48px] w-[48px] rounded-full`}
                />
                <View>
                  <Text
                    style={tw.style(`text-[20px] text-white`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {isDriver && !hasAssignedDriver
                      ? (data?.username || data?.name || data?.passenger_name || "Passenger") // Driver viewing passenger
                      : (hasAssignedDriver && data?.driver_name ? data?.driver_name : data?.username)}
                  </Text>
                  {isDriver && !hasAssignedDriver && (
                    <Text
                      style={tw.style(`text-xs text-gray-300 mt-1`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Ride Request
                    </Text>
                  )}
                  {hasAssignedDriver && data?.driver_id && (
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

            {/* Status badge - show cancelled, completed, pending, etc. */}
            {statusConfig && (
              <View style={tw`mx-4 mt-3 mb-2`}>
                <View style={tw`rounded-[18px] p-4`} >
                  <View
                    style={[
                      tw`self-start px-3 py-1.5 rounded-full mb-2`,
                      { backgroundColor: statusConfig.bg },
                    ]}
                  >
                    <Text
                      style={[
                        tw`text-sm capitalize`,
                        { color: statusConfig.text, fontFamily: "RobotoMedium" },
                      ]}
                    >
                      {statusConfig.label}
                    </Text>
                  </View>
                  <Text
                    style={tw.style(`text-[16px] text-[#242E42]`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {statusConfig.label}
                  </Text>
                  <Text
                    style={tw.style(`text-[13px] text-[#7B7F87] mt-1`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    {statusDetails.hint}
                  </Text>
                  <View style={tw`flex-row items-center mt-4`}>
                    {progressSteps.map((step, index) => {
                      const active = bookingStage === "finished" ? true : index <= progressIndex;
                      const isLast = index === progressSteps.length - 1;
                      return (
                        <React.Fragment key={step.key}>
                          <View style={tw`items-center`}>
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                backgroundColor: active ? statusDetails.accent : "#D7D9DD",
                              }}
                            />
                            <Text
                              style={{
                                marginTop: 6,
                                color: active ? "#242E42" : "#A0A4AB",
                                fontSize: 10,
                                fontFamily: active ? "RobotoBold" : "RobotoRegular",
                              }}
                            >
                              {step.label}
                            </Text>
                          </View>
                          {!isLast ? (
                            <View
                              style={{
                                flex: 1,
                                height: 3,
                                marginHorizontal: 6,
                                marginBottom: 18,
                                borderRadius: 999,
                                backgroundColor:
                                  bookingStage === "finished" || index < progressIndex
                                    ? statusDetails.accent
                                    : "#E6E8EC",
                              }}
                            />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

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
                      if (lowerPickup.includes('select') ||
                          (lowerPickup.includes('current location') && lowerPickup.includes('accuracy'))) {
                        return "Pickup location";
                      }
                      const formatted = formatAddressForDisplay(pickup);
                      return formatted.primary ? formatted.full : pickup;
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
                      if (lowerDropoff.includes('select') || 
                          (lowerDropoff.includes('current location') && lowerDropoff.includes('accuracy'))) {
                        return "Drop-off location";
                      }
                      const formatted = formatAddressForDisplay(dropoff);
                      return formatted.primary ? formatted.full : dropoff;
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
            {isDriver && !hasAssignedDriver && !isCancelled && !isCompleted && (
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
                        {formatPhoneForDisplay((data as any).phone)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            {/* Driver Information Section - Show when driver has accepted */}
            {hasAssignedDriver && (data?.driver_id || data?.driver_name) && (
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
                        {formatPhoneForDisplay(data.driver_phone)}
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
            <View
              style={tw.style(
                `flex-col gap-y-4`,
                hasAssignedDriver && `mt-12`,
                { paddingBottom: Math.max(insets.bottom + 8, 14) }
              )}
            >
              {/* Accept Ride button - only for drivers viewing unaccepted bookings */}
              {!hasAssignedDriver && isDriver && !isCancelled && !isCompleted && (
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
              {hasAssignedDriver && !isCancelled && !isCompleted && isBookingValid(
                data?.booking_date as string,
                data?.booking_time as string
              ) && (
                <>
                  {/* Start Ride button - only for drivers when ride not yet started */}
                  {isDriver && !isInProgressOrStarted && (
                    <TouchableOpacity
                      onPress={() => BookingAction(data?.booking_id as string, "start")}
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

                  {/* Complete Ride button - only for drivers when ride is in progress */}
                  {isDriver && isInProgressOrStarted && (
                    <TouchableOpacity
                      onPress={() => BookingAction(data?.booking_id as string, "complete")}
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
                      onPress={() => BookingAction(data?.booking_id as string, "start")}
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

                  {/* Cancel button - only for drivers when accepted and not cancelled */}
                  {isDriver && cancel && !isCancelled && !isInProgressOrStarted && (
                    <TouchableOpacity
                      onPress={handleCancelPress}
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

              {/* Cancel button for passengers to cancel their booking - hide when cancelled */}
              {!isDriver && cancel && !isCancelled && !isInProgressOrStarted && (
                <TouchableOpacity
                  onPress={handleCancelPress}
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
