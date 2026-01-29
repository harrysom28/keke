import {
  ACTIVE_BOOKING,
  DRIVER_ACCEPT_BOOKING,
  DRIVER_BOOKINGS,
  DRIVER_BOOKING_ID,
  DRIVER_CANCEL_BOOKING,
  DRIVER_LATEST_BOOKING,
} from "@/constants";
import { AuthState } from "@/store/AuthSlice";
import { useSelector } from "react-redux";
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
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";

import { AntDesign, Entypo } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmptyData from "@/components/emptyData";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  item: object;
  onView: () => void;
}

function ListItem({ item, onView }: Readonly<LProps>) {
  return (
    <View>
      <View
        style={tw.style(
          `flex-row items-start px-5 py-4 bg-white rounded-[10px]`,
          {
            elevation: 4,
          }
        )}
      >
        {/* Left side: Pins and dotted line */}
        <View style={tw`flex-col items-center mr-4`}>
          <Entypo name="location-pin" size={24} color="#F44336" />
          <View
            style={tw.style(
              `h-[40px] border-l-2 border-dashed border-[#C8C7CC]`
            )}
          />
          <Entypo name="location-pin" size={24} color="#4CAF50" />
        </View>

        {/* Right side: Content */}
        <View style={tw`flex-1 flex-col justify-between`}>
          {/* Origin section */}
          <View style={tw`mb-4`}>
            <View style={tw`flex-row items-center justify-between mb-1`}>
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
                {item?.booking_date && item?.booking_time && item.booking_date !== '' && item.booking_time !== ''
                  ? `${formatBookingDate(item.booking_date)} ${formatBookingTime(item.booking_time)}`
                  : item?.scheduled_at
                    ? (() => {
                        try {
                          const date = new Date(item.scheduled_at);
                          if (!isNaN(date.getTime())) {
                            const dateStr = date.toISOString().split('T')[0];
                            const timeStr = date.toTimeString().split(' ')[0].substring(0, 5);
                            return `${formatBookingDate(dateStr)} ${formatBookingTime(timeStr)}`;
                          }
                        } catch {}
                        return "Select Date Select Time";
                      })()
                    : "Select Date Select Time"}
              </Text>
            </View>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {item?.pickup_location && item.pickup_location !== 'Pickup location' && !item.pickup_location.includes('Current Location')
                ? item.pickup_location
                : "Pickup location"}
            </Text>
          </View>

          {/* Destination section */}
          <View>
            <Text
              style={tw.style(`text-[18px] text-[#5A5A5A] mb-1`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Destination
            </Text>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {item?.dropoff_location && item.dropoff_location !== 'Drop-off location'
                ? item.dropoff_location
                : "Drop-off location"}
            </Text>
          </View>
        </View>
      </View>

      {/* View details section */}
      <View
        style={tw.style(
          `bg-white px-5 pt-4 pb-3 -mt-2 rounded-b-[10px]`,
          {
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
      </View>
    </View>
  );
}

const Bookings = () => {
  let isFocused = useIsFocused();
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const { apiConfig } = useContext(AppContext);
  const { user } = useSelector(AuthState);
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [change, setChange] = useState(false);
  const [data, setData] = useState([]);
  const [booking, setBooking] = useState({});

  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    axios
      .post(DRIVER_CANCEL_BOOKING, { booking_id }, apiConfig)
      .then(({ data }) => {
        // console.log(data?.data);
        bottomSheetRef?.current?.close();
        setChange((prev) => !prev);
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
          showMessage({
            type: "danger",
            message: err?.response?.data.error,
          });
        }
      })
      .finally(() => loading(false));
  };

  const getActiveBooking = () => {
    setLoading(true);
    // Use list-bookings endpoint to get all bookings for the rider
    const endpoint = user?.profile?.role === 'driver' 
      ? `${DRIVER_BOOKINGS}?role=driver&limit=50`
      : `${DRIVER_BOOKINGS}?role=rider&limit=50`;
    
    axios
      .get(endpoint, apiConfig)
      .then(({ data }) => {
        // Handle different response formats
        let bookings = [];
        if (data?.data?.scheduled_bookings) {
          bookings = data.data.scheduled_bookings;
        } else if (Array.isArray(data?.data)) {
          bookings = data.data;
        } else if (data?.data) {
          bookings = [data.data];
        }
        
        console.log('📋 Raw booking data from API:', JSON.stringify(bookings, null, 2));
        
        // Map booking data to ensure proper format
        const mappedData = bookings.map((booking: any) => {
          // Parse scheduled_at date if available - handle multiple formats
          let scheduledAt = null;
          if (booking.scheduled_at) {
            scheduledAt = new Date(booking.scheduled_at);
          } else if (booking.scheduledAt) {
            scheduledAt = new Date(booking.scheduledAt);
          }
          
          // Extract date and time from scheduled_at
          let bookingDate = '';
          let bookingTime = '';
          
          if (scheduledAt && !isNaN(scheduledAt.getTime())) {
            bookingDate = scheduledAt.toISOString().split('T')[0];
            bookingTime = scheduledAt.toTimeString().split(' ')[0].substring(0, 5);
          } else {
            // Fallback to booking_date and booking_time if available
            bookingDate = booking.booking_date || '';
            bookingTime = booking.booking_time || '';
            
            // If we have booking_date but no booking_time, try to extract from scheduled_at string
            if (bookingDate && !bookingTime && (booking.scheduled_at || booking.scheduledAt)) {
              try {
                const tempDate = new Date(booking.scheduled_at || booking.scheduledAt);
                if (!isNaN(tempDate.getTime())) {
                  bookingTime = tempDate.toTimeString().split(' ')[0].substring(0, 5);
                }
              } catch (e) {
                console.log('Error parsing scheduled_at for time', e);
              }
            }
          }
          
          // Extract pickup location - prioritize address, avoid "Current Location" strings
          const rawPickup = booking.pickup?.address || booking.pickup_location || booking.origin || booking.pickup?.name || '';
          const pickupLocation = rawPickup && !rawPickup.includes('Current Location') && !rawPickup.includes('accuracy')
            ? rawPickup
            : (booking.pickup?.address || booking.pickup_location || booking.origin || 'Pickup location');
          
          // Extract dropoff location
          const rawDropoff = booking.dropoff?.address || booking.dropoff_location || booking.destination || booking.dropoff?.name || '';
          const dropoffLocation = rawDropoff || 'Drop-off location';
          
          console.log('📋 Mapped booking:', {
            booking_id: booking.ride_id || booking._id || booking.booking_id,
            bookingDate,
            bookingTime,
            pickupLocation,
            dropoffLocation,
            hasScheduledAt: !!scheduledAt
          });
          
          return {
            booking_id: booking.booking_id || booking.ride_id || booking._id || '',
            ride_id: booking.ride_id || booking._id || '',
            pickup_location: pickupLocation,
            dropoff_location: dropoffLocation,
            booking_date: bookingDate,
            booking_time: bookingTime,
            scheduled_at: booking.scheduled_at || booking.scheduledAt || null,
            status: booking.status || 'requested',
            payment_method: booking.payment_method || booking.payment_type || 'cash',
            cost: booking.fare || booking.cost || 0,
            // Driver information
            driver_id: booking.driver_id || booking.driver?.user?._id || booking.driver?.user || null,
            driver_name: booking.driver?.user?.name || booking.driver?.name || booking.driver_name || null,
            driver_image: booking.driver?.user?.profileImage || booking.driver?.profileImage || booking.driver_image || null,
            driver_phone: booking.driver?.user?.phone || booking.driver?.phone || booking.driver_phone || null,
            driver_rating: booking.driver?.user?.rating || booking.driver?.rating?.average || booking.driver?.rating || booking.driver_rating || null,
            driver_rating_count: booking.driver?.rating?.count || booking.driver?.reviews_count || (booking.driver as any)?.rating_count || null,
            driver_total_rides: booking.driver?.totalRides || booking.driver?.total_rides || (booking.driver as any)?.totalRides || null,
            driver_union_number: booking.driver?.unionNumber || booking.driver?.union_number || (booking.driver as any)?.unionNumber || null,
            vehicle_type: booking.vehicle_type?.name || booking.vehicle_type?.display_name || booking.vehicle_type || null,
            vehicle_number: booking.driver?.vehicleDetails?.plateNumber || booking.vehicle_number || null,
            ...booking, // Include all other fields
          };
        });
        console.log('📋 Final mapped data:', mappedData);
        setData(mappedData);
      })
      .catch((err) => {
        console.log(err, "ebr");
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isFocused) {
      getActiveBooking();
    }
  }, [isFocused, change]);

  const ViewBooking = (booking_id: string) => {
    if (!booking_id) {
      showMessage({
        type: "danger",
        message: "Invalid booking ID",
      });
      return;
    }
    
    bottomSheetRef?.current?.open();
    setViewLoading(true);
    
    // First, try to find booking in existing data array
    const existingBooking = data.find((item: any) => 
      item?.booking_id === booking_id || 
      item?.ride_id === booking_id || 
      item?._id === booking_id
    );
    
    if (existingBooking) {
      console.log('📋 Using existing booking data from list', { booking_id, existingBooking });
      // Extract fare/cost - handle both number and fare object
      const fare = (() => {
        if (typeof existingBooking.fare === 'number') return existingBooking.fare;
        if (typeof existingBooking.cost === 'number') return existingBooking.cost;
        if (existingBooking.cost && typeof existingBooking.cost === 'object' && (existingBooking.cost as any).totalFare) {
          return (existingBooking.cost as any).totalFare;
        }
        if (existingBooking.fare && typeof existingBooking.fare === 'object' && (existingBooking.fare as any).totalFare) {
          return (existingBooking.fare as any).totalFare;
        }
        return 0;
      })();
      
      const mappedBooking = {
        booking_id: booking_id,
        ride_id: existingBooking.ride_id || existingBooking._id || booking_id,
        pickup_location: existingBooking.pickup_location || '',
        dropoff_location: existingBooking.dropoff_location || '',
        booking_date: existingBooking.booking_date || '',
        booking_time: existingBooking.booking_time || '',
        scheduled_at: existingBooking.scheduled_at,
        fare: fare,
        status: existingBooking.status || 'requested',
        payment_method: existingBooking.payment_method || existingBooking.payment_type || 'cash',
        cost: fare,
        is_started: existingBooking.is_started || existingBooking.is_ride_started || false,
        // Passenger/Rider information
        username: existingBooking.username || existingBooking.passenger?.name || existingBooking.rider?.name || 'Passenger',
        image: existingBooking.image || existingBooking.passenger?.profileImage || existingBooking.rider?.profileImage || null,
        // Driver information (when driver has accepted)
        driver_id: existingBooking.driver_id || null,
        driver_name: existingBooking.driver_name || null,
        driver_image: existingBooking.driver_image || null,
        driver_phone: existingBooking.driver_phone || null,
        driver_rating: existingBooking.driver_rating || null,
        driver_rating_count: (existingBooking as any)?.driver_rating_count || null,
        driver_total_rides: (existingBooking as any)?.driver_total_rides || null,
        driver_union_number: (existingBooking as any)?.driver_union_number || null,
        vehicle_type: existingBooking.vehicle_type || null,
        vehicle_number: existingBooking.vehicle_number || null,
      };
      
      setBooking(mappedBooking);
      setViewLoading(false);
      return;
    }
    
    // If not found in existing data, try API call (but endpoint may not exist)
    axios
      .get(DRIVER_BOOKING_ID + booking_id + "/booking", apiConfig)
      .then(({ data }) => {
        const bookingData = data?.data || {};
        
        // Parse scheduled_at date if available
        const scheduledAt = bookingData.scheduled_at ? new Date(bookingData.scheduled_at) : null;
        const bookingDate = scheduledAt && !isNaN(scheduledAt.getTime())
          ? scheduledAt.toISOString().split('T')[0]
          : bookingData.booking_date || '';
        const bookingTime = scheduledAt && !isNaN(scheduledAt.getTime())
          ? scheduledAt.toTimeString().split(' ')[0].substring(0, 5)
          : bookingData.booking_time || '';
        
        // Extract fare/cost - handle both number and fare object
        const fare = (() => {
          if (typeof bookingData.fare === 'number') return bookingData.fare;
          if (typeof bookingData.cost === 'number') return bookingData.cost;
          if (bookingData.cost && typeof bookingData.cost === 'object' && bookingData.cost.totalFare) {
            return bookingData.cost.totalFare;
          }
          if (bookingData.fare && typeof bookingData.fare === 'object' && bookingData.fare.totalFare) {
            return bookingData.fare.totalFare;
          }
          return 0;
        })();
        
        // Map booking data with driver information
        const mappedBooking = {
          booking_id: booking_id,
          ride_id: bookingData.ride_id || bookingData._id || booking_id,
          pickup_location: bookingData.pickup?.address || bookingData.pickup_location || bookingData.origin || '',
          dropoff_location: bookingData.dropoff?.address || bookingData.dropoff_location || bookingData.destination || '',
          booking_date: bookingDate,
          booking_time: bookingTime,
          scheduled_at: bookingData.scheduled_at,
          fare: fare,
          status: bookingData.status || 'requested',
          payment_method: bookingData.payment_method || bookingData.payment_type || 'cash',
          cost: fare,
          is_started: bookingData.is_started || bookingData.is_ride_started || false,
          // Passenger/Rider information (for driver view)
          username: bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || 'Passenger',
          image: bookingData.passenger?.profileImage || bookingData.rider?.profileImage || bookingData.image || null,
          // Driver information (when driver has accepted)
          driver_id: bookingData.driver_id || bookingData.driver?.user?._id || bookingData.driver?.user || null,
          driver_name: bookingData.driver?.user?.name || bookingData.driver?.name || bookingData.driver_name || null,
          driver_image: bookingData.driver?.user?.profileImage || bookingData.driver?.profileImage || bookingData.driver_image || null,
          driver_phone: bookingData.driver?.user?.phone || bookingData.driver?.phone || bookingData.driver_phone || null,
          driver_rating: bookingData.driver?.user?.rating || bookingData.driver?.rating?.average || bookingData.driver?.rating || bookingData.driver_rating || null,
          driver_rating_count: bookingData.driver?.rating?.count || bookingData.driver?.reviews_count || (bookingData.driver as any)?.rating_count || null,
          driver_total_rides: bookingData.driver?.totalRides || bookingData.driver?.total_rides || (bookingData.driver as any)?.totalRides || null,
          driver_union_number: bookingData.driver?.unionNumber || bookingData.driver?.union_number || (bookingData.driver as any)?.unionNumber || null,
          vehicle_type: bookingData.vehicle_type?.name || bookingData.vehicle_type?.display_name || bookingData.vehicle_type || null,
          vehicle_number: bookingData.driver?.vehicleDetails?.plateNumber || bookingData.vehicle_number || null,
        };
        
        setBooking(mappedBooking);
        setViewLoading(false);
      })
      .catch((err) => {
        const status = err?.response?.status || err?.status;
        
        // Silently handle 404 errors - booking not found or endpoint doesn't exist
        if (status === 404) {
          console.log('📋 Booking not found (404) - endpoint may not exist', { booking_id });
          showMessage({
            type: "info",
            message: "Booking details not available. The booking may have been cancelled or completed.",
          });
          bottomSheetRef?.current?.close();
          setViewLoading(false);
          return;
        }
        
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        } else if (err?.response?.data?.error) {
          showMessage({
            type: "danger",
            message: err?.response?.data.error,
          });
        } else {
          showMessage({
            type: "danger",
            message: "Unable to load booking details. Please try again.",
          });
        }
        bottomSheetRef?.current?.close();
        setViewLoading(false);
      });
  };

  return (
    <>
      <DriverBookingSheet
        bottomSheetRef={bottomSheetRef}
        data={booking}
        isloading={viewLoading}
        cancel={(booking_id, loading) => CancelBooking(booking_id, loading)}
        viewBooking={(booking_id) => ViewBooking(booking_id)}
        accepted={!!booking?.driver_id || booking?.status === 'accepted'}
      />

      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5 h-[188px]`)}>
          <View style={tw`flex-row items-center`}>
            <TouchableOpacity
              style={tw`bg-black w-[40px] h-[40px] rounded-[20px] z-50 items-center justify-center`}
              onPress={() => router.back()}
            >
              <AntDesign name="left" size={24} color="white" />
            </TouchableOpacity>
            <Text
              style={tw.style(
                `text-white text-2xl text-center w-[100%] -ml-[40px]`,
                {
                  fontFamily: "RobotoBold",
                }
              )}
            >
              Bookings
            </Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={tw.color("base-green")} />
        ) : data.length === 0 ? (
          <EmptyData />
        ) : (
          <ScrollView
            style={tw.style(`-mt-20 z-50`)}
            contentContainerStyle={tw.style(`flex-col gap-y-3 pt-4 pb-9 px-6`)}
          >
            {data.map((item, index) => {
              // Ensure unique key - use booking_id if available, otherwise use index
              const uniqueKey = item?.booking_id || item?.ride_id || item?._id || `booking-${index}`;
              return (
                <ListItem
                  key={uniqueKey}
                  item={item}
                  onView={() => ViewBooking(item?.booking_id || item?.ride_id || item?._id)}
                />
              );
            })}
          </ScrollView>
        )}
      </ImageBackground>
    </>
  );
};

export default Bookings;
