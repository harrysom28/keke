import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CLOSEST_BOOKING,
  DRIVER_BOOKINGS,
  DRIVER_BOOKING_ID,
  DRIVER_CANCEL_BOOKING,
} from "@/constants";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  formatBookingDate,
  formatBookingTime,
  getLocalBookingDateAndTime,
} from "@/lib/formatBookingDateTime";

import { AppContext } from "@/app/context";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmptyData from "@/components/emptyData";
import { MapArrowSvg } from "@/svg";
import axios from "axios";
import { postAcceptScheduledBooking } from "@/utils/acceptScheduledBooking";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  item: object;
  onPress: (
    booking_id: string,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  onView: () => void;
  accepted?: boolean;
}

function ListItem({ item, onPress, onView, accepted }: Readonly<LProps>) {
  const [loading, setLoading] = useState(false);

  return (
    <View>
      <View
        style={tw.style(
          `flex-row items-start gap-x-2 px-5 py-3.5 bg-white rounded-[10px]`,
          {
            elevation: 4,
          }
        )}
      >
        {MapArrowSvg()}
        <View style={tw`flex-col h-[95px] justify-between w-[88%]`}>
          <View>
            <View style={tw`flex-row items-center justify-between`}>
              <Text
                style={tw.style(`text-[18px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Origin
              </Text>
              <Text
                style={tw.style(`text-[12px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {formatBookingDate(item?.booking_date)}{" "}
                {formatBookingTime(item?.booking_time)}
              </Text>
            </View>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {accepted ? item?.pickup_location : item?.origin}
            </Text>
          </View>
          <View>
            <View style={tw`flex-row justify-between`}>
              <Text
                style={tw.style(`text-[18px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Destination
              </Text>
            </View>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {accepted ? item?.dropoff_location : item?.destination}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={tw.style(
          `flex-row gap-x-2 justify-between items-center bg-white px-5 pt-7 pb-3 -mt-4 rounded-[10px]`,
          {
            zIndex: -1,
            elevation: 6,
          }
        )}
      >
        <TouchableOpacity onPress={onView}>
          <Text
            style={tw.style(`text-[14px] text-[#4A4A4A]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            View details
          </Text>
        </TouchableOpacity>
        {!accepted && (
          <TouchableOpacity
            onPress={() => onPress(item?.booking_id, setLoading)}
            style={tw`bg-base-green px-4 py-1 rounded-[5px]`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-[14px] text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Accept
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const Tab = ["Available", "Accepted"];

const Bookings = () => {
  let isFocused = useIsFocused();
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const { apiConfig } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [change, setChange] = useState(false);
  const [data, setData] = useState([]);
  const [booking, setBooking] = useState({});
  const [selected, setSelected] = useState(Tab[0]);

  const AcceptBooking = async (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    try {
      const result = await postAcceptScheduledBooking(booking_id, apiConfig);
      if (result.ok) {
        if (result.wentOnlineFirst) {
          safeShowMessage({
            type: "info",
            message: "You were set online to accept this booking.",
          });
        }
        safeShowMessage({
          type: "success",
          message:
            (result.data as { message?: string })?.message ||
            "Booking accepted successfully",
        });
        setChange((prev) => !prev);
        return;
      }
      if (result.silent && result.status === 401) {
        console.log("Authentication error (401) - token refresh should handle this");
        return;
      }
      if (result.silent && result.status === 404) {
        console.log("Resource not found (404) - silently handling");
        return;
      }
      safeShowMessage({ type: "danger", message: result.message });
    } catch (err) {
      console.log("Accept booking error:", err);
      safeShowMessage({ type: "danger", message: getErrorMessage(err) });
    } finally {
      loading(false);
    }
  };
  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    axios
      .post(DRIVER_CANCEL_BOOKING, { booking_id }, apiConfig)
      .then(({ data }) => {
        safeShowMessage({
          type: "success",
          message: data?.message || "Booking cancelled successfully",
        });
        bottomSheetRef?.current?.close();
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
        
        // Silently handle 404 errors (driver profile not found, booking not found, etc.)
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
      })
      .finally(() => loading(false));
  };

  // Helper function to map backend response to frontend format
  const mapBookingData = (booking: any) => {
    if (!booking) return null;
    
    const { booking_date: bookingDate, booking_time: bookingTime } = getLocalBookingDateAndTime(booking.scheduled_at);
    
    // Extract pickup location - try multiple sources
    let pickupLocation = '';
    const pickupSources = [
      booking.pickup?.address,
      booking.pickup_location,
      booking.pickup?.name,
      booking.pickup?.location?.address,
      booking.pickup?.location?.name,
      booking.origin,
    ];
    
    for (const source of pickupSources) {
      if (source && typeof source === 'string' && source.trim() !== '') {
        const lowerSource = source.toLowerCase();
        // Only skip if it's clearly a placeholder
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
      booking.dropoff?.address,
      booking.dropoff_location,
      booking.dropoff?.name,
      booking.dropoff?.location?.address,
      booking.dropoff?.location?.name,
      booking.destination,
    ];
    
    for (const source of dropoffSources) {
      if (source && typeof source === 'string' && source.trim() !== '') {
        const lowerSource = source.toLowerCase();
        // Only skip if it's clearly a placeholder
        if (!lowerSource.includes('select') && 
            !(lowerSource.includes('current location') && lowerSource.includes('accuracy'))) {
          dropoffLocation = source.trim();
          break;
        }
      }
    }
    
    // Extract passenger info
    const passengerName = booking.passenger?.name || booking.rider?.name || booking.username || 'Passenger';
    const passengerImage = booking.passenger?.profileImage || booking.passenger?.image || booking.rider?.profileImage || booking.rider?.image || null;
    const passengerPhone = booking.passenger?.phone || booking.rider?.phone || booking.phone || null;
    
    return {
      booking_id: booking.ride_id || booking._id || '',
      ride_id: booking.ride_id || booking._id || '',
      origin: pickupLocation,
      destination: dropoffLocation,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      booking_date: bookingDate,
      booking_time: bookingTime,
      scheduled_at: booking.scheduled_at,
      fare: booking.fare || 0,
      status: booking.status || 'requested',
      passenger: booking.passenger || booking.rider || null,
      vehicle_type: booking.vehicle_type?.name || booking.vehicle_type?.display_name || booking.vehicle_type || null,
      cost: (() => {
        if (typeof booking.fare === 'number') return String(booking.fare);
        if (typeof booking.cost === 'number') return String(booking.cost);
        if (booking.cost && typeof booking.cost === 'object' && booking.cost.totalFare) {
          return String(booking.cost.totalFare);
        }
        if (booking.fare && typeof booking.fare === 'object' && booking.fare.totalFare) {
          return String(booking.fare.totalFare);
        }
        return '0';
      })(),
      username: passengerName,
      name: passengerName,
      image: passengerImage,
      passenger_image: passengerImage,
      passenger_name: passengerName,
      phone: passengerPhone,
      payment_method: booking.payment_method || booking.payment_type || 'cash',
    };
  };

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      if (selected === Tab[0]) {
        // Available tab - get closest available booking
        axios
          .get(CLOSEST_BOOKING, apiConfig)
          .then(({ data }) => {
            console.log('Closest booking:', data?.data);
            const booking = data?.data?.booking;
            if (booking) {
              const mapped = mapBookingData(booking);
              setData(mapped ? [mapped] : []);
            } else {
              setData([]);
            }
          })
          .catch((err) => {
            console.log('Closest booking error:', err?.response?.data);
            const status = err?.response?.status || err?.status;
            
            // Silently handle 401 errors - token refresh should happen automatically via API client
            if (status === 401) {
              console.log('Authentication error (401) - token refresh should handle this');
              setData([]);
              return;
            }
            
            // Silently handle 404 errors (no bookings available, driver profile not found, etc.)
            if (status === 404) {
              console.log('Resource not found (404) - silently handling');
              setData([]);
              return;
            }
            
            const errorMessage = getErrorMessage(err);
            safeShowMessage({
              type: "danger",
              message: errorMessage,
            });
            setData([]);
          })
          .finally(() => setLoading(false));
      } else {
        // Accepted tab - get accepted scheduled bookings
        axios
          .get(DRIVER_BOOKINGS + '?role=driver', apiConfig)
          .then(({ data }) => {
            console.log('Accepted bookings:', data?.data);
            const bookings = data?.data?.scheduled_bookings || [];
            const mappedBookings = bookings
              .map((booking: any) => mapBookingData(booking))
              .filter((booking: any) => booking !== null);
            setData(Array.isArray(mappedBookings) ? mappedBookings : []);
          })
          .catch((err) => {
            console.log('Accepted bookings error:', err?.response?.data);
            const status = err?.response?.status || err?.status;
            
            // Silently handle 401 errors - token refresh should happen automatically via API client
            if (status === 401) {
              console.log('Authentication error (401) - token refresh should handle this');
              setData([]);
              return;
            }
            
            // Silently handle 404 errors (no bookings available, driver profile not found, etc.)
            if (status === 404) {
              console.log('Resource not found (404) - silently handling');
              setData([]);
              return;
            }
            
            const errorMessage = getErrorMessage(err);
            safeShowMessage({
              type: "danger",
              message: errorMessage,
            });
            setData([]);
          })
          .finally(() => setLoading(false));
      }
    }
  }, [isFocused, change, selected]);

  const ViewBooking = (booking_id: string) => {
    const id = String(booking_id || "").trim();
    if (!/^[a-f\d]{24}$/i.test(id)) {
      safeShowMessage({
        type: "warning",
        message: "This booking cannot be opened yet. Pull to refresh or try again shortly.",
      });
      return;
    }
    bottomSheetRef?.current?.open();
    setViewLoading(true);
    // Map the booking data to expected format
    const currentBooking = data.find(
      (item: any) => item.booking_id === id || item.ride_id === id
    );
    if (currentBooking) {
      setBooking(currentBooking);
      setViewLoading(false);
    } else {
      // Fallback: try to fetch from API if not found in current data
      axios
        .get(DRIVER_BOOKING_ID + id + "/booking", apiConfig)
        .then(({ data }) => {
          console.log(data?.data);
          const mapped = mapBookingData(data?.data);
          setBooking(mapped || { booking_id });
        })
        .catch((err) => {
          console.log('View booking error:', err?.response?.data);
          const status = err?.response?.status || err?.status;
          
          // Silently handle 401 errors - token refresh should happen automatically via API client
          if (status === 401) {
            console.log('Authentication error (401) - token refresh should handle this');
            bottomSheetRef?.current?.close();
            return;
          }
          
          // Silently handle 404 errors (driver profile not found, booking not found, etc.)
          if (status === 404) {
            console.log('Resource not found (404) - silently handling');
            bottomSheetRef?.current?.close();
            return;
          }
          
          // Use centralized error handler to extract safe string message
          const errorMessage = getErrorMessage(err);
          safeShowMessage({
            type: "danger",
            message: errorMessage,
          });
          bottomSheetRef?.current?.close();
        })
        .finally(() => setViewLoading(false));
    }
  };

  return (
    <>
      <DriverBookingSheet
        bottomSheetRef={bottomSheetRef}
        data={booking}
        isloading={viewLoading}
        accepted={!!booking?.driver_id || booking?.status === "accepted"}
        action={(booking_id, loading) => AcceptBooking(booking_id, loading)}
        cancel={(booking_id, loading) => CancelBooking(booking_id, loading)}
        viewBooking={(booking_id) => ViewBooking(booking_id)}
      />

      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5 h-[200px]`)}>
          <View style={tw``}>
            <Text
              style={tw.style(`text-white text-2xl text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Bookings
            </Text>
          </View>

          <View style={tw`flex-row items-center justify-center mt-5 gap-x-8`}>
            {Tab.map((item) => (
              <Pressable
                key={item}
                style={tw`flex-col items-center gap-y-[2px]`}
                onPress={() => setSelected(item)}
              >
                <Text
                  style={tw.style(
                    `text-[16px]`,
                    selected === item ? `text-white` : `text-[#C8C7CC]`,
                    {
                      fontFamily: "RobotoMedium",
                    }
                  )}
                >
                  {item}
                </Text>
                {selected === item && (
                  <View
                    style={tw.style(`w-[48px] h-[3px] rounded`, `bg-white`)}
                  />
                )}
              </Pressable>
            ))}
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={tw.color("base-green")} />
        ) : !Array.isArray(data) || data.length === 0 ? (
          <EmptyData />
        ) : (
          <ScrollView
            style={tw.style(`-mt-16 z-50`)}
            contentContainerStyle={tw.style(`flex-col gap-y-3 pt-4 pb-9 px-6`)}
          >
            {data.map((item) => (
              <ListItem
                key={item?.booking_id}
                item={item}
                onPress={(booking_id, loading) =>
                  AcceptBooking(booking_id, loading)
                }
                onView={() => ViewBooking(item?.booking_id)}
                accepted={selected === Tab[1]}
              />
            ))}
          </ScrollView>
        )}
      </ImageBackground>
    </>
  );
};

export default Bookings;
