import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { Path, Svg } from "react-native-svg";
import RNDateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { REQUEST_RIDE, VEHICLE_TYPES } from "@/constants";
import axios from "axios";
import { setAppData, AppDetailsState } from "@/store/AppSlice";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import { geocodeAddress, reverseGeocode } from "@/utils/mapsApi";
import tw from "@/lib/tailwind";
import { useDispatch, useSelector } from "react-redux";
import { useFocusEffect } from "expo-router";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import CustomPlacesAutocomplete from "@/components/CustomPlacesAutocomplete";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  getActiveBooking: () => void;
}

type ModeType = "date" | "time" | "datetime" | "countdown";

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// Calculate estimated fare based on distance and vehicle type
const calculateFare = (distanceKm: number, vehicleType: string): number => {
  const baseFare = 200; // Base fare in Naira
  const perKmRate: { [key: string]: number } = {
    Keke: 50,
    Okada: 40,
    Taxi: 80,
    Bike: 40,
    Car: 80,
  };
  
  const rate = perKmRate[vehicleType] || 50;
  const total = baseFare + distanceKm * rate;
  return Math.round(total);
};

const BookRideSheet = ({ bottomSheetRef, getActiveBooking }: Props) => {
  const dispatch = useDispatch();
  const { apiConfig } = useContext(AppContext);
  const { rideUtils } = useSelector(AppDetailsState);
  const { location } = useCurrentLocation({ isFocused: true });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ModeType>("date");
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState(false); // Admin approval required
  
  // Calculate height similar to findRide.tsx
  const screenHeight = Dimensions.get('window').height;
  const validHeight = Math.max(screenHeight * 0.95, 600); // Minimum 600px
  const scrollViewHeight = validHeight - 200; // Subtract space for header and button
  const [state, setState] = useState({
    pickup_location: "",
    dropoff_location: "",
    booking_date: "",
    booking_time: "",
    payment_type: "Wallet", // Default to Wallet
    vehicle_type_id: "",
    vehicle_type_name: "",
  });

  // Format date for display (e.g., "Jan 26, 2026")
  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  // Format time for display (e.g., "4:30 PM")
  const formatTimeDisplay = (timeStr: string): string => {
    if (!timeStr) return "";
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes || 0, 0);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return timeStr;
    }
  };

  const onChange = (event: DateTimePickerEvent, date: Date | undefined) => {
    if (date === undefined) return;
    setShow(false);
    if (mode === "date") {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const formattedDate = `${year}-${month}-${day}`;
      setState((prev) => ({ ...prev, booking_date: formattedDate }));
    } else {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const formattedTime = `${hours}:${minutes}:${seconds}`;
      setState((prev) => ({ ...prev, booking_time: formattedTime }));
    }
  };

  const showPicker = (str: ModeType) => {
    setMode(str);
    setShow(true);
  };

  const handleBack = () => {
    setState({
      pickup_location: "",
      dropoff_location: "",
      booking_date: "",
      booking_time: "",
      payment_type: "Wallet",
      vehicle_type_id: "",
      vehicle_type_name: "",
    });
    setEstimatedFare(null);
    setPickupCoords(null);
    setDropoffCoords(null);
    bottomSheetRef?.current?.close();
    dispatch(setAppData({ isBooking: false }));
  };

  // Fetch vehicle types on mount
  useEffect(() => {
    if (apiConfig) {
      axios
        .get(VEHICLE_TYPES, apiConfig)
        .then(({ data }) => {
          const types = data?.data?.vehicle_types || data?.data || [];
          // Filter to only show keke, bike, and taxi
          const allowedTypes = ['keke', 'bike', 'taxi'];
          const filteredTypes = types.filter((vehicle: any) => {
            const vehicleName = (vehicle.name || vehicle.displayName || "").toLowerCase();
            return allowedTypes.some(allowed => vehicleName.includes(allowed.toLowerCase()));
          });
          setVehicleTypes(Array.isArray(filteredTypes) ? filteredTypes : []);
          // Set default vehicle type if available
          if (filteredTypes.length > 0 && !state.vehicle_type_id) {
            const defaultType = filteredTypes[0];
            // Vehicle objects use vehicle_id field, not _id or id
            const defaultId = String(defaultType.vehicle_id || defaultType._id || defaultType.id || '');
            const defaultName = defaultType.name || defaultType.displayName || defaultType.display_name || "";
            console.log('🚗 Setting default vehicle type:', { defaultId, defaultName, defaultType });
            if (defaultId && defaultId !== 'undefined') {
              setState((prev) => ({ 
                ...prev, 
                vehicle_type_id: defaultId,
                vehicle_type_name: defaultName
              }));
            }
          }
        })
        .catch((err) => {
          console.log('Error fetching vehicle types:', err?.response?.data);
        });
    }
  }, [apiConfig]);

  // Set pickup location from user's current location - automatically use actual location
  useEffect(() => {
    if (location.latitude !== 0 && location.longitude !== 0) {
      const accuracy = location.accuracy || 0;
      const pickupAddress = rideUtils?.user_location?.name || rideUtils?.user_location?.formatted_address;
      
      // Always use current location as pickup, format with accuracy if available
      let locationAddress = pickupAddress;
      if (!locationAddress || locationAddress.includes('Current Location')) {
        if (accuracy > 0) {
          locationAddress = pickupAddress || `Current Location (${accuracy.toFixed(0)}m accuracy)`;
        } else {
          locationAddress = pickupAddress || `Current Location (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`;
        }
      }
      
      // Always update pickup location to current location
      setState((prev) => ({ 
        ...prev, 
        pickup_location: locationAddress 
      }));
      setPickupCoords({ lat: location.latitude, lng: location.longitude });
    }
  }, [location, rideUtils]);

  // Calculate fare when locations and vehicle type change
  useEffect(() => {
    if (pickupCoords && dropoffCoords && state.vehicle_type_name) {
      const distance = calculateDistance(
        pickupCoords.lat,
        pickupCoords.lng,
        dropoffCoords.lat,
        dropoffCoords.lng
      );
      const fare = calculateFare(distance, state.vehicle_type_name);
      setEstimatedFare(fare);
    } else if (pickupCoords && state.vehicle_type_name) {
      // Show placeholder fare even without destination
      setEstimatedFare(0);
    } else {
      setEstimatedFare(null);
    }
  }, [pickupCoords, dropoffCoords, state.vehicle_type_name]);

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

      return () => backHandler.remove();
    }, [])
  );

  const handleUseCurrentLocation = () => {
    if (location.latitude === 0 || location.longitude === 0) {
      safeShowMessage({
        type: "warning",
        message: "Location not available. Please wait or search for a location.",
      });
      return;
    }

    const accuracy = location.accuracy || 0;
    if (accuracy > 100) {
      safeShowMessage({
        type: "warning",
        message: `Location accuracy is low (${accuracy.toFixed(0)}m). For best results, wait for GPS to lock or search for a location.`,
      });
    }

    const pickupAddress = rideUtils?.user_location?.name || rideUtils?.user_location?.formatted_address;
    const locationAddress = pickupAddress || `Current Location (${accuracy.toFixed(0)}m accuracy)`;

    setState((prev) => ({ ...prev, pickup_location: locationAddress }));
    setPickupCoords({ lat: location.latitude, lng: location.longitude });

    safeShowMessage({
      type: accuracy < 20 ? "success" : "info",
      message: `Using current location (${accuracy.toFixed(0)}m accuracy)`,
    });
  };

  const handleVehicleTypeSelect = (vehicle: any) => {
    // Vehicle objects use vehicle_id field, not _id or id
    const vehicleId = String(vehicle.vehicle_id || vehicle._id || vehicle.id || '');
    const vehicleName = vehicle.name || vehicle.displayName || vehicle.display_name || "";
    console.log('🚗 Vehicle selected:', { vehicleId, vehicleName, vehicle });
    setState((prev) => ({
      ...prev,
      vehicle_type_id: vehicleId,
      vehicle_type_name: vehicleName,
    }));
  };

  const handleSubmit = async () => {
    if (!state.pickup_location || !state.dropoff_location) {
      safeShowMessage({
        type: "danger",
        message: "Please enter both pickup and destination locations",
      });
      return;
    }

    if (!state.booking_date || !state.booking_time) {
      safeShowMessage({
        type: "danger",
        message: "Please select both date and time for your scheduled pickup",
      });
      return;
    }

    if (!state.payment_type) {
      safeShowMessage({
        type: "danger",
        message: "Please select a payment method",
      });
      return;
    }

    if (!state.vehicle_type_id) {
      safeShowMessage({
        type: "danger",
        message: "Please select a vehicle type",
      });
      return;
    }

    setLoading(true);

    try {
      // Use stored coordinates if available, otherwise geocode addresses
      let pickupLocation: { lat: number; lng: number };
      let dropoffLocation: { lat: number; lng: number };
      let pickupAddress: string;
      let dropoffAddress: string;
      let pickupName: string;
      let dropoffName: string;

      // Handle pickup location
      if (pickupCoords && pickupCoords.lat && pickupCoords.lng) {
        // Use stored coordinates (current location)
        pickupLocation = { lat: pickupCoords.lat, lng: pickupCoords.lng };
        pickupAddress = state.pickup_location || rideUtils?.user_location?.formatted_address || `Current Location (${pickupCoords.lat}, ${pickupCoords.lng})`;
        pickupName = rideUtils?.user_location?.name || pickupAddress.split(',')[0];
      } else {
        // Geocode pickup address
        const pickupGeocode = await geocodeAddress(state.pickup_location);
        if (!pickupGeocode?.results?.[0]) {
          safeShowMessage({
            type: "danger",
            message: "Could not find coordinates for pickup location. Please check the address.",
          });
          setLoading(false);
          return;
        }
        pickupLocation = pickupGeocode.results[0].geometry.location;
        pickupAddress = pickupGeocode.results[0].formatted_address;
        pickupName = pickupAddress.split(',')[0];
      }

      // Handle dropoff location
      if (dropoffCoords && dropoffCoords.lat && dropoffCoords.lng) {
        // Use stored coordinates
        dropoffLocation = { lat: dropoffCoords.lat, lng: dropoffCoords.lng };
        dropoffAddress = state.dropoff_location;
        dropoffName = dropoffAddress.split(',')[0];
      } else {
        // Geocode dropoff address
        const dropoffGeocode = await geocodeAddress(state.dropoff_location);
        if (!dropoffGeocode?.results?.[0]) {
          safeShowMessage({
            type: "danger",
            message: "Could not find coordinates for destination. Please check the address.",
          });
          setLoading(false);
          return;
        }
        dropoffLocation = dropoffGeocode.results[0].geometry.location;
        dropoffAddress = dropoffGeocode.results[0].formatted_address;
        dropoffName = dropoffAddress.split(',')[0];
      }

      // Combine date and time into ISO string for scheduledAt
      const [year, month, day] = state.booking_date.split('-').map(Number);
      const [hours, minutes, seconds] = state.booking_time.split(':').map(Number);
      const scheduledDateTime = new Date(year, month - 1, day, hours, minutes, seconds || 0);
      
      if (scheduledDateTime < new Date()) {
        safeShowMessage({
          type: "danger",
          message: "Scheduled time must be in the future",
        });
        setLoading(false);
        return;
      }

      // Map payment type to backend format
      const paymentMethodMap: { [key: string]: string } = {
        'Cash': 'cash',
        'Wallet': 'wallet',
        'cash': 'cash',
        'wallet': 'wallet',
      };
      const paymentMethod = paymentMethodMap[state.payment_type] || 'wallet';

      // Prepare request data
      const requestData = {
        pickupLocation: {
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          name: pickupName,
          address: pickupAddress,
        },
        dropoffLocation: {
          lat: dropoffLocation.lat,
          lng: dropoffLocation.lng,
          name: dropoffName,
          address: dropoffAddress,
        },
        vehicleTypeId: state.vehicle_type_id,
        paymentMethod: paymentMethod,
        scheduledAt: scheduledDateTime.toISOString(),
      };

      console.log('📤 Scheduling ride:', requestData);

      axios
        .post(REQUEST_RIDE, requestData, apiConfig)
        .then(({ data }) => {
          getActiveBooking();
          safeShowMessage({
            type: "success",
            message: data?.message || "Ride scheduled successfully",
          });
          handleBack();
        })
        .catch((err) => {
          console.log('Schedule ride error:', err?.response?.data);
          const status = err?.response?.status || err?.status;
          
          if (status === 401) {
            console.log('Authentication error (401) - token refresh should handle this');
            return;
          }
          
          const errorMessage = getErrorMessage(err);
          safeShowMessage({
            type: "danger",
            message: errorMessage,
          });
        })
        .finally(() => setLoading(false));
    } catch (error: any) {
      console.log('Geocoding error:', error);
      const errorMessage = getErrorMessage(error);
      safeShowMessage({
        type: "danger",
        message: errorMessage || "Failed to process locations. Please try again.",
      });
      setLoading(false);
    }
  };

  // Get vehicle icon based on type
  const getVehicleIcon = (vehicleType: string) => {
    const type = vehicleType.toLowerCase();
    if (type.includes('keke') || type.includes('tricycle')) {
      return <MaterialCommunityIcons name="rickshaw" size={32} color="#3C8F7C" />;
    } else if (type.includes('okada') || type.includes('bike') || type.includes('motorcycle')) {
      return <MaterialCommunityIcons name="motorbike" size={32} color="#3C8F7C" />;
    } else {
      return <MaterialCommunityIcons name="car" size={32} color="#3C8F7C" />;
    }
  };

  return (
    <>
      <BottomSheet
        height={validHeight}
        ref={bottomSheetRef}
        animationType="spring"
        backdropMaskColor="#19191900"
        openDuration={1000}
        closeDuration={1000}
        disableKeyboardHandling={true}
        style={tw.style(`px-5 py-4 rounded-t-[32px] bg-white`, {
          position: 'relative',
        })}
        closeOnDragDown={false}
      >
        {show && (
          <RNDateTimePicker
            value={
              mode === "date" && state.booking_date
                ? new Date(state.booking_date + "T00:00:00")
                : mode === "time" && state.booking_time
                ? new Date(
                    (state.booking_date || new Date().toISOString().split("T")[0]) +
                      "T" +
                      state.booking_time
                  )
                : new Date()
            }
            minimumDate={new Date()}
            mode={mode}
            onChange={onChange}
          />
        )}
        <View style={tw.style(`flex-1`, {
          minHeight: validHeight * 0.8,
        })}>
          {/* Header */}
          <View style={tw`flex-row items-center justify-center mb-4`}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color="#242E42" style={tw`mr-2`} />
            <Text
              style={tw.style(`text-2xl text-[#242E42]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Schedule a Ride
            </Text>
            <TouchableOpacity
              onPress={handleBack}
              style={tw`absolute right-0 h-[32px] w-[32px] items-center justify-center`}
            >
              <AntDesign name="close" size={20} color="#242E42" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={tw.style(`flex-1`, {
              height: scrollViewHeight,
            })}
            contentContainerStyle={tw.style(`pb-6`, {
              flexGrow: 1,
            })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            scrollEnabled={true}
          >
            {/* Pickup Location Card - Same as Find a Ride */}
            <View style={tw`bg-[#F5F5F5] rounded-[12px] p-4 mb-3`}>
              <View style={tw`flex-row justify-between items-center mb-2`}>
                <Text style={tw.style(`text-[13px] text-[#C8C7CC] uppercase`, { fontFamily: "RobotoRegular" })}>
                  Pickup
                </Text>
                {location.latitude !== 0 && (
                  <TouchableOpacity
                    onPress={handleUseCurrentLocation}
                    style={tw`flex-row items-center gap-x-1 bg-[#3C8F7C] px-2.5 py-1 rounded-full`}
                  >
                    <MaterialCommunityIcons name="crosshairs-gps" size={12} color="white" />
                    <Text style={tw.style(`text-[10px] text-white`, { fontFamily: "RobotoMedium" })}>
                      Use Current
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={tw`pr-2`}>
                <CustomPlacesAutocomplete
                  placeholder="Enter pick up location"
                  initialValue={state.pickup_location}
                  showClearButton={false}
                  onPlaceSelected={(place) => {
                    const locationData = {
                      place_id: place.place_id || null,
                      name: place.name || "",
                      formatted_address: place.formatted_address || place.name || "",
                      long: place.long,
                      lat: place.lat,
                    };
                    const displayValue = place.name || place.formatted_address || "Selected location";
                    setState((prev) => ({ ...prev, pickup_location: displayValue }));
                    setPickupCoords({ lat: place.lat, lng: place.long });
                  }}
                  onClear={() => {
                    // When cleared, reset to current location
                    if (location.latitude !== 0 && location.longitude !== 0) {
                      const accuracy = location.accuracy || 0;
                      const pickupAddress = rideUtils?.user_location?.name || rideUtils?.user_location?.formatted_address;
                      const locationAddress = pickupAddress || (accuracy > 0 
                        ? `Current Location (${accuracy.toFixed(0)}m accuracy)` 
                        : `Current Location (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`);
                      setState((prev) => ({ ...prev, pickup_location: locationAddress }));
                      setPickupCoords({ lat: location.latitude, lng: location.longitude });
                    } else {
                      setState((prev) => ({ ...prev, pickup_location: "" }));
                      setPickupCoords(null);
                    }
                  }}
                  styles={{
                    textInput: tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoRegular",
                      borderWidth: 0,
                      backgroundColor: "transparent",
                      paddingVertical: 0,
                      paddingHorizontal: 0,
                    }),
                  }}
                />
              </View>
            </View>

            {/* Destination Location Card - Same as Find a Ride */}
            <View style={tw`bg-[#F5F5F5] rounded-[12px] p-4 mb-3`}>
              <Text style={tw.style(`text-[13px] text-[#C8C7CC] uppercase mb-2`, { fontFamily: "RobotoRegular" })}>
                Drop-off
              </Text>
              <View style={tw`pr-2`}>
                <CustomPlacesAutocomplete
                  placeholder="Enter drop-off location"
                  initialValue={state.dropoff_location}
                  showClearButton={false}
                  onPlaceSelected={(place) => {
                    const locationData = {
                      place_id: place.place_id || null,
                      name: place.name || "",
                      formatted_address: place.formatted_address || place.name || "",
                      long: place.long,
                      lat: place.lat,
                    };
                    const displayValue = place.name || place.formatted_address || "Selected location";
                    setState((prev) => ({ ...prev, dropoff_location: displayValue }));
                    setDropoffCoords({ lat: place.lat, lng: place.long });
                  }}
                  onClear={() => {
                    setState((prev) => ({ ...prev, dropoff_location: "" }));
                    setDropoffCoords(null);
                  }}
                  styles={{
                    textInput: tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoRegular",
                      borderWidth: 0,
                      backgroundColor: "transparent",
                      paddingVertical: 0,
                      paddingHorizontal: 0,
                    }),
                  }}
                />
              </View>
            </View>

            {/* Date and Time Cards - Side by Side */}
            <View style={tw`flex-row gap-x-3 mb-4`}>
              <TouchableOpacity
                onPress={() => showPicker("date")}
                style={tw`flex-1 bg-[#F5F5F5] rounded-[12px] p-4`}
              >
                <View style={tw`flex-row items-center mb-2`}>
                  <MaterialCommunityIcons name="calendar" size={18} color="#3C8F7C" style={tw`mr-2`} />
                  <Text style={tw.style(`text-sm text-[#666]`, { fontFamily: "RobotoMedium" })}>
                    Date
                  </Text>
                </View>
                <Text style={tw.style(`text-base text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                  {state.booking_date ? formatDateDisplay(state.booking_date) : "Select Date"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => showPicker("time")}
                style={tw`flex-1 bg-[#F5F5F5] rounded-[12px] p-4`}
              >
                <View style={tw`flex-row items-center mb-2`}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color="#3C8F7C" style={tw`mr-2`} />
                  <Text style={tw.style(`text-sm text-[#666]`, { fontFamily: "RobotoMedium" })}>
                    Time
                  </Text>
                </View>
                <Text style={tw.style(`text-base text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                  {state.booking_time ? formatTimeDisplay(state.booking_time) : "Select Time"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Select Vehicle Type Section */}
            <Text style={tw.style(`text-lg text-[#242E42] mb-3`, { fontFamily: "RobotoBold" })}>
              Select Vehicle Type
            </Text>
            {vehicleTypes.length > 0 ? (
              <View style={tw`flex-row flex-wrap mb-4`}>
                {vehicleTypes.map((vehicle, index) => {
                  // Vehicle objects use vehicle_id field, not _id or id
                  const vehicleId = String(vehicle.vehicle_id || vehicle._id || vehicle.id || '');
                  const isSelected = String(state.vehicle_type_id) === vehicleId && vehicleId !== '' && vehicleId !== 'undefined';
                  const vehicleName = vehicle.name || vehicle.displayName || vehicle.display_name || "";
                  // Ensure unique key by always including index to prevent duplicates
                  const uniqueKey = vehicleId && vehicleId !== 'undefined' ? `vehicle-${vehicleId}-${index}` : `vehicle-${index}-${vehicleName}`;
                  // 3 items per row with proper spacing
                  const marginRight = (index + 1) % 3 !== 0 ? 8 : 0;
                  const marginBottom = index < vehicleTypes.length - 3 ? 8 : 0;
                  return (
                    <TouchableOpacity
                      key={uniqueKey}
                      onPress={() => handleVehicleTypeSelect(vehicle)}
                      style={tw.style(
                        `bg-[#F5F5F5] rounded-[12px] p-4 items-center justify-center relative`,
                        isSelected && `bg-[#E8F5E9] border-2 border-[#3C8F7C]`,
                        { 
                          width: '31%',
                          marginRight,
                          marginBottom
                        }
                      )}
                    >
                      {getVehicleIcon(vehicleName)}
                      <Text style={tw.style(
                        `text-sm mt-2`, 
                        { fontFamily: "RobotoBold" },
                        isSelected ? `text-[#3C8F7C]` : `text-[#242E42]`
                      )}>
                        {vehicleName}
                      </Text>
                      {isSelected && (
                        <View style={tw`absolute top-1 right-1`}>
                          <MaterialCommunityIcons name="check-circle" size={20} color="#3C8F7C" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={tw`items-center py-4 mb-4`}>
                <ActivityIndicator size="small" color="#3C8F7C" />
                <Text style={tw.style(`text-sm text-[#666] mt-2`, { fontFamily: "RobotoMedium" })}>
                  Loading vehicle types...
                </Text>
              </View>
            )}

            {/* Payment Type Selection */}
            <Text style={tw.style(`text-lg text-[#242E42] mb-3`, { fontFamily: "RobotoBold" })}>
              Payment Type
            </Text>
            <View style={tw`flex-row gap-x-3 mb-4`}>
              <TouchableOpacity
                onPress={() => setState((prev) => ({ ...prev, payment_type: "Wallet" }))}
                style={tw.style(
                  `flex-1 bg-[#F5F5F5] rounded-[12px] p-2 items-center justify-center`,
                  state.payment_type === "Wallet" && `bg-[#E8F5E9] border-2 border-[#3C8F7C]`
                )}
              >
                <MaterialCommunityIcons name="wallet" size={16} color="#3C8F7C" />
                <Text style={tw.style(`text-xs text-[#242E42] mt-1`, { fontFamily: "RobotoBold" })}>
                  Wallet
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (cashPaymentEnabled) {
                    setState((prev) => ({ ...prev, payment_type: "Cash" }));
                  } else {
                    safeShowMessage({
                      type: "info",
                      message: "Cash payment requires admin approval. Please contact support.",
                    });
                  }
                }}
                disabled={!cashPaymentEnabled}
                style={tw.style(
                  `flex-1 bg-[#F5F5F5] rounded-[12px] p-2 items-center justify-center`,
                  state.payment_type === "Cash" && `bg-[#E8F5E9] border-2 border-[#3C8F7C]`,
                  !cashPaymentEnabled && `opacity-50`
                )}
              >
                <MaterialCommunityIcons name="cash" size={16} color={cashPaymentEnabled ? "#3C8F7C" : "#999"} />
                <Text style={tw.style(
                  `text-xs mt-1`, 
                  { fontFamily: "RobotoBold" },
                  cashPaymentEnabled ? `text-[#242E42]` : `text-[#999]`
                )}>
                  Cash
                </Text>
                {!cashPaymentEnabled && (
                  <Text style={tw.style(`text-[8px] text-[#999] mt-0.5`, { fontFamily: "RobotoRegular" })}>
                    Admin approval required
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Sum Fee Display - Always show when vehicle type is selected */}
            {state.vehicle_type_id && (
              <View style={tw`bg-[#F5F5F5] rounded-[12px] p-4 mb-3`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw.style(`text-base text-[#666]`, { fontFamily: "RobotoMedium" })}>
                    Estimated Fare
                  </Text>
                  <Text style={tw.style(`text-2xl text-[#3C8F7C]`, { fontFamily: "RobotoBold" })}>
                    {estimatedFare !== null && estimatedFare > 0 
                      ? `₦${estimatedFare.toLocaleString()}` 
                      : "₦---"}
                  </Text>
                </View>
                {!dropoffCoords && (
                  <Text style={tw.style(`text-xs text-[#999] mt-1`, { fontFamily: "RobotoRegular" })}>
                    Enter destination to see fare estimate
                  </Text>
                )}
              </View>
            )}
          </ScrollView>

          {/* Schedule Ride Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={tw.style(
              `bg-[#3C8F7C] py-4 rounded-[12px] items-center justify-center mt-2`,
              loading && `opacity-50`
            )}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-lg text-white`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Schedule Ride
              </Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
};

export default BookRideSheet;
