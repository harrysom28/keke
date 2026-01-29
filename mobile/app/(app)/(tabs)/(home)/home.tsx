import {
  ACTIVE_BOOKING,
  ACTIVE_RIDE,
  CANCEL_BOOKING,
  DRIVER_BOOKING_ID,
  DRIVER_PASSENGER_LOCATION,
  LOCATION_UPDATE,
} from "@/constants";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AntDesign,
  FontAwesome5,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  AppDetailsState,
  setAppData,
  setRideData,
  setRideUtils,
  setSubscriptionUtils,
} from "@/store/AppSlice";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import POIMarkers from "@/components/map/POIMarkers";
import UserLocationMarker from "@/components/map/UserLocationMarker";
import VehicleMarker from "@/components/map/VehicleMarker";
import { LIGHT_MAP_STYLE } from "@/constants/mapStyle";
import { Platform } from "react-native";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useThrottledLocationUpdate } from "@/hooks/useThrottledLocationUpdate";
import Svg, { Path } from "react-native-svg";
import { TBooking, TRide } from "@/types";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";
import { useDispatch, useSelector } from "react-redux";
import apiClient from "@/utils/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ActiveRideSheet from "./_modals/activeRide";
import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import BookRideSheet from "./_modals/bookRide";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmergencyModal from "./_modals/emergencyModal";
import FindRideSheet from "./_modals/findRide";
import MapDirections from "@/components/activeRide/mapDirections";
import DriverTracking, { DriverETA } from "@/components/activeRide/driverTracking";
import PaymentReceiptModal from "@/shared/modal/paymentReceipt";
import { Portal } from "@gorhom/portal";
import TripCompletedModal from "@/shared/modal/tripCompleted";
import { getGreeting } from "@/lib/getGreeting";
import { router, useLocalSearchParams } from "expo-router";
import CustomPlacesAutocomplete from "@/components/CustomPlacesAutocomplete";
import { getErrorMessage } from "@/utils/errorHandler";
import logger from "@/utils/logger";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useIsFocused } from "@react-navigation/native";
import usePusherChannel from "@/hooks/usePusherChannel";

// Map zoom level - adjusted for better street-level detail visibility
// 0.012-0.015 shows good balance of detail and area coverage (like screenshot)
const mapDelta = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

interface ILocation {
  name: string;
  lat: string;
  long: string;
}

export type IARide = {
  screen:
    | "WAITING"
    | "REVIEW"
    | "SEARCH"
    | "DRIVERS"
    | "DRIVER"
    | "REQUEST-CHANGE"
    | "";
  data: {
    waiting: {
      ride_id?: string;
      cost?: string;
      origin?: ILocation;
      destination?: ILocation;
      driver?: {
        driver_user_id: string;
        driver_name: string;
        driver_image: string;
      };
    };
  };
};
export default function HomeScreen() {
  const isFocused = useIsFocused();
  const params = useLocalSearchParams();
  const { isBooking, subscription, ride: reduxRide } = useSelector(AppDetailsState);
  const { user, token } = useSelector(AuthState);
  const { getCurrentUser, apiConfig, notificationEvent } =
    useContext(AppContext);
  const dispatch = useDispatch();
  // ref
  const emergencySheetRef = useRef<BottomSheetMethods>(null);
  const rideSheetRef = useRef<BottomSheetMethods>(null);
  const bookRideSheetRef = useRef<BottomSheetMethods>(null);
  const activeRideSheetRef = useRef<BottomSheetMethods>(null);
  const bookingViewSheetRef = useRef<BottomSheetMethods>(null);
  const mapRef = useRef<MapView>(null);
  const { location, address, loading: locationLoading } = useCurrentLocation({ isFocused });
  const [mapReady, setMapReady] = useState(false);
  const [booking, setBooking] = useState<Partial<TBooking>>({});
  const [viewbooking, setViewbooking] = useState<Partial<TBooking>>({});
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(false);
  const [tripCompleted, setTripCompleted] = useState(false);
  const [trigger, setTrigger] = useState(0);
  const [dismissedBookingId, setDismissedBookingId] = useState<string | null>(null);
  const [nearby, setNearby] = useState<
    {
      location: {
        name: string;
        latitude: number;
        longitude: number;
      };
    }[]
  >([]);
  const [temp, setTemp] = useState<TRide>({} as TRide);
  const [ride, setRide] = useState<IARide>({
    screen: "",
    data: { waiting: {} },
  });
  const [driverLocation, setDriverLocation] = useState<{ lat: number; long: number; eta: number | null; distance: number | null } | null>(null);

  const [maps, setMaps] = useState({
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
  });
  
  // Key to force MapDirections refresh when route is cleared
  const [routeKey, setRouteKey] = useState(0);

  // Use location if we have valid coordinates (be more lenient with accuracy)
  const hasValidLocation = location.latitude !== 0 && 
                          location.longitude !== 0 && 
                          !isNaN(location.latitude) && 
                          !isNaN(location.longitude);
  
  // Check if location has good accuracy (for centering preference)
  const hasGoodAccuracy = hasValidLocation && 
                          (location.accuracy === undefined || location.accuracy === null || location.accuracy < 1000);

  // Default region (Nigeria) - only used as fallback if GPS never becomes available
  const DEFAULT_REGION = {
    latitude: 9.082,
    longitude: 8.6753,
    ...mapDelta,
  };

  // Clear ride state function - resets all ride-related state cleanly
  // This function must be defined before getActiveRide and other functions that use it
  const clearRideState = useCallback(() => {
    logger.info('🧹 Clearing ride state completely');
    
    // Clear map coordinates (this will hide polylines and markers)
    setMaps({
      origin: { latitude: 0, longitude: 0 },
      destination: { latitude: 0, longitude: 0 },
    });
    
    // Clear active ride data
    setTemp({} as TRide);
    
    // Clear ride UI state
    setRide({
      screen: "",
      data: { waiting: {} },
    });
    
    // Clear driver location
    setDriverLocation(null);
    
    // Increment route key to force MapDirections refresh
    setRouteKey(prev => prev + 1);
    
    // Reset Redux state
    dispatch(
      setAppData({
        isBooking: false,
      })
    );
    dispatch(setSubscriptionUtils({ chat: false }));
    
    // Animate map to default home region (user location or default)
    if (mapRef.current) {
      const currentHasValidLocation = location.latitude !== 0 && 
                                     location.longitude !== 0 && 
                                     !isNaN(location.latitude) && 
                                     !isNaN(location.longitude);
      const defaultRegion = currentHasValidLocation ? {
        latitude: location.latitude,
        longitude: location.longitude,
        ...mapDelta,
      } : DEFAULT_REGION;
      
      mapRef.current.animateToRegion(defaultRegion, 800);
      logger.debug('✅ Map animated to default home region', defaultRegion);
    }
  }, [location.latitude, location.longitude, dispatch]);

  // Use GPS location if available, otherwise use default region
  // IMPORTANT: Always prefer GPS location over default region
  // For initialRegion, wait for valid location to avoid showing wrong region
  const mapRegion = hasValidLocation ? {
    latitude: location.latitude,
    longitude: location.longitude,
    ...mapDelta,
  } : DEFAULT_REGION; // Use default region so map can render
  
  // Create a stable key for the map to force re-render when location changes significantly
  // This ensures the map centers correctly on the new location
  const mapKey = hasValidLocation 
    ? `map-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}`
    : 'map-default';
  
  logger.debug("Map region calculated", {
    hasValidLocation,
    hasGoodAccuracy,
    coordinates: hasValidLocation ? { lat: location.latitude, lng: location.longitude } : "none",
    accuracy: location.accuracy ? `${location.accuracy.toFixed(0)}m` : "unknown",
    usingDefault: !hasValidLocation,
    mapKey,
  });

  // Center map on actual GPS location when it becomes available
  useEffect(() => {
    // Only center if we have coordinates, map is ready, and no active route
    if (hasValidLocation && mapReady && mapRef.current && maps.origin.latitude === 0 && maps.destination.latitude === 0) {
      const currentLat = location.latitude;
      const currentLng = location.longitude;
      
      logger.debug("Centering map on GPS location", {
        latitude: currentLat,
        longitude: currentLng,
        accuracy: location.accuracy ? `${location.accuracy.toFixed(0)}m` : 'unknown',
        hasGoodAccuracy,
        mapReady,
        source: location.accuracy && location.accuracy < 20 ? "GPS (excellent)" : 
                location.accuracy && location.accuracy < 50 ? "GPS (good)" : 
                location.accuracy && location.accuracy < 200 ? "GPS (fair)" : "GPS/Network",
      });
      
      // Center immediately with exact GPS coordinates
      const centerMap = () => {
        if (mapRef.current && mapReady) {
          try {
            mapRef.current.animateToRegion({
              latitude: currentLat,
              longitude: currentLng,
              ...mapDelta,
            }, 1000);
            logger.debug("Map centered on exact GPS location", { lat: currentLat, lng: currentLng });
          } catch (error) {
            logger.error("Error centering map", error);
          }
        }
      };
      
      // Wait a bit for map to be fully ready, then center multiple times
      // This ensures the map has fully rendered before we try to center
      setTimeout(centerMap, 100);
      setTimeout(centerMap, 300);
      setTimeout(centerMap, 600);
      setTimeout(centerMap, 1000);
      setTimeout(centerMap, 2000); // Extra attempt after 2 seconds
    } else if (!hasValidLocation) {
      logger.warn("Cannot center map - no valid location", {
        lat: location.latitude,
        lng: location.longitude,
        hasValidLocation,
        mapReady,
      });
    } else if (!mapReady) {
      logger.debug("Waiting for map to be ready before centering");
    }
  }, [hasValidLocation, hasGoodAccuracy, mapReady, location.latitude, location.longitude, location.accuracy, maps.origin.latitude, maps.destination.latitude]);

  // Debug: Log when marker should be visible
  useEffect(() => {
    if (hasValidLocation) {
      logger.debug("Location marker should be visible", {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        hasValidLocation,
      });
    } else {
      logger.warn("Location marker NOT visible", {
        hasValidLocation,
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
      });
    }
  }, [hasValidLocation, location.latitude, location.longitude, location.accuracy]);

  const animateToMapDirections = (item: IARide["data"]["waiting"]) => {
    if (item?.origin?.lat && item?.destination?.lat) {
      // Use tighter zoom to show better street-level detail (matches screenshot)
      let mapDelta = { latitudeDelta: 0.015, longitudeDelta: 0.015 };
      let origin = {
        latitude: parseFloat(item?.origin?.lat),
        longitude: parseFloat(item?.origin?.long),
      };
      let destination = {
        latitude: parseFloat(item?.destination?.lat as string),
        longitude: parseFloat(item?.destination?.long as string),
      };

      // Animate map to show both origin and destination
      mapRef.current?.fitToCoordinates(
        [origin, destination],
        {
          edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
          animated: true,
        }
      );

      // Set maps state with clean coordinate objects (no mapDelta)
      setMaps({
        origin,
        destination,
      });
      
      logger.debug('MapDirections: Set origin and destination', { origin, destination });
    } else {
      safeShowMessage({ type: "danger", message: "Incomplete ride data" });
    }
  };

  const getActiveBooking = () => {
    // Load dismissed booking ID from storage
    AsyncStorage.getItem('dismissedBookingId').then((storedDismissedId) => {
      if (storedDismissedId) {
        setDismissedBookingId(storedDismissedId);
      }
    });
    
    apiClient
      .get(ACTIVE_BOOKING)
      .then(async ({ data }) => {
        const bookings = data?.data || [];
        if (Array.isArray(bookings) && bookings.length > 0) {
          const bookingData = bookings[0];
          
          // Filter out cancelled or completed bookings
          const status = bookingData.status || bookingData.ride_status || '';
          if (status === 'cancelled' || status === 'completed') {
            logger.debug('Booking is cancelled or completed, clearing', { status: String(status) });
            setBooking({});
            // Clear dismissed state if booking is cancelled/completed
            await AsyncStorage.removeItem('dismissedBookingId');
            setDismissedBookingId(null);
            return;
          }
          
          // Check if this booking was dismissed
          const dismissedId = await AsyncStorage.getItem('dismissedBookingId');
          const bookingId = bookingData.ride_id || bookingData._id || bookingData.booking_id;
          if (dismissedId && dismissedId === bookingId) {
            logger.debug('Booking was dismissed, skipping display');
            setBooking({});
            return;
          }
          
          // Parse scheduled_at date if available - handle multiple formats
          let scheduledAt = null;
          if (bookingData.scheduled_at) {
            scheduledAt = new Date(bookingData.scheduled_at);
          } else if (bookingData.scheduledAt) {
            scheduledAt = new Date(bookingData.scheduledAt);
          }
          
          // Extract date and time from scheduled_at
          let bookingDate = '';
          let bookingTime = '';
          
          if (scheduledAt && !isNaN(scheduledAt.getTime())) {
            bookingDate = scheduledAt.toISOString().split('T')[0];
            bookingTime = scheduledAt.toTimeString().split(' ')[0].substring(0, 5);
          } else {
            // Fallback to booking_date and booking_time if available
            bookingDate = bookingData.booking_date || '';
            bookingTime = bookingData.booking_time || '';
            
            // If we have booking_date but no booking_time, try to extract from scheduled_at string
            if (bookingDate && !bookingTime && bookingData.scheduled_at) {
              try {
                const tempDate = new Date(bookingData.scheduled_at);
                if (!isNaN(tempDate.getTime())) {
                  bookingTime = tempDate.toTimeString().split(' ')[0].substring(0, 5);
                }
              } catch (e) {
                logger.debug('Error parsing scheduled_at for time', e);
              }
            }
          }
          
          logger.debug('Parsed booking date/time', { 
            scheduled_at: String(bookingData.scheduled_at || bookingData.scheduledAt || ''),
            bookingDate: String(bookingDate || ''),
            bookingTime: String(bookingTime || ''),
            hasScheduledAt: !!scheduledAt,
            isValidDate: scheduledAt ? !isNaN(scheduledAt.getTime()) : false
          });
          
          // Map booking data to match TBooking format
          // Extract dropoff location - prioritize address field, then location name, then fallback fields
          let dropoffLocation = '';
          // Try multiple sources in order of preference
          const dropoffSources = [
            bookingData.dropoff?.address,
            bookingData.dropoff_location,
            bookingData.dropoff?.name,
            bookingData.dropoff?.location?.address,
            bookingData.dropoff?.location?.name,
            bookingData.destination,
            bookingData.destination_location,
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
          
          // Extract pickup location similarly
          let pickupLocation = '';
          // Try multiple sources in order of preference
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
              // Only skip if it's clearly a placeholder
              if (!lowerSource.includes('select') && 
                  !(lowerSource.includes('current location') && lowerSource.includes('accuracy'))) {
                pickupLocation = source.trim();
                break;
              }
            }
          }
          
          const mappedBooking = {
            booking_id: bookingData.ride_id || bookingData._id || bookingData.booking_id || '',
            ride_id: bookingData.ride_id || bookingData._id || '',
            pickup_location: pickupLocation,
            dropoff_location: dropoffLocation,
            booking_date: bookingDate,
            booking_time: bookingTime,
            scheduled_at: bookingData.scheduled_at || bookingData.scheduledAt || null,
            // Extract fare/cost - handle both number and fare object
            fare: (() => {
              if (typeof bookingData.fare === 'number') return bookingData.fare;
              if (typeof bookingData.cost === 'number') return bookingData.cost;
              if (bookingData.cost && typeof bookingData.cost === 'object' && (bookingData.cost as any).totalFare) {
                return (bookingData.cost as any).totalFare;
              }
              if (bookingData.fare && typeof bookingData.fare === 'object' && (bookingData.fare as any).totalFare) {
                return (bookingData.fare as any).totalFare;
              }
              return 0;
            })(),
            status: bookingData.status || 'requested',
            payment_method: bookingData.payment_method || bookingData.payment_type || 'cash',
            cost: (() => {
              if (typeof bookingData.fare === 'number') return String(bookingData.fare);
              if (typeof bookingData.cost === 'number') return String(bookingData.cost);
              if (bookingData.cost && typeof bookingData.cost === 'object' && (bookingData.cost as any).totalFare) {
                return String((bookingData.cost as any).totalFare);
              }
              if (bookingData.fare && typeof bookingData.fare === 'object' && (bookingData.fare as any).totalFare) {
                return String((bookingData.fare as any).totalFare);
              }
              return '0';
            })(),
            is_started: bookingData.is_started || bookingData.is_ride_started || false,
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
            // Additional fields for passenger/rider
            name: bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || '',
            username: bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || '',
            image: bookingData.passenger?.profileImage || bookingData.rider?.profileImage || bookingData.image || '',
            phone: bookingData.passenger?.phone || bookingData.rider?.phone || bookingData.phone || null,
            origin: bookingData.pickup?.address || bookingData.pickup_location || '',
          };
          
          logger.debug('Mapped booking data for home screen', { 
            booking_id: mappedBooking.booking_id,
            booking_date: mappedBooking.booking_date,
            booking_time: mappedBooking.booking_time,
            pickup_location: mappedBooking.pickup_location,
            dropoff_location: mappedBooking.dropoff_location,
            has_driver: !!mappedBooking.driver_id,
            raw_dropoff: bookingData.dropoff,
            raw_dropoff_location: bookingData.dropoff_location,
            raw_destination: bookingData.destination,
            raw_pickup: bookingData.pickup,
            raw_pickup_location: bookingData.pickup_location,
            raw_origin: bookingData.origin,
            final_pickup: pickupLocation,
            final_dropoff: dropoffLocation
          });
          setBooking(mappedBooking);
        } else {
          setBooking({});
        }
      })
      .catch((err) => {
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          logger.debug('Authentication error (401) - token refresh should handle this');
          setBooking({});
          return;
        }
        
        // Silently handle 404 errors (no active booking, etc.)
        if (status === 404) {
          logger.debug('Resource not found (404) - silently handling');
          setBooking({});
          return;
        }
        
        // Log other errors
        logger.error('Active booking error', err, { response: err?.response?.data });
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        setBooking({});
      });
  };

  useEffect(() => {
    if (isFocused) {
      // Load dismissed booking ID on focus
      AsyncStorage.getItem('dismissedBookingId').then((dismissedId) => {
        if (dismissedId) {
          setDismissedBookingId(dismissedId);
        }
      });
      getActiveBooking();
    }
  }, [isFocused]);

  // Check if we should open book ride sheet from route params
  useEffect(() => {
    if (params?.openBookRide === "true" && isFocused && bookRideSheetRef?.current) {
      // Small delay to ensure the screen is fully loaded
      const timer = setTimeout(() => {
        bookRideSheetRef?.current?.open();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [params?.openBookRide, isFocused]);

  // Check if we should open find ride sheet from route params (for rebook)
  useEffect(() => {
    if (params?.openFindRide === "true" && isFocused && rideSheetRef?.current) {
      // Small delay to ensure the screen is fully loaded
      const timer = setTimeout(() => {
        rideSheetRef?.current?.open();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [params?.openFindRide, isFocused]);

  const getActiveRide = () => {
    setLoading(true);
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 10000); // 10 second timeout

    apiClient
      .get(ACTIVE_RIDE)
      .then(({ data }) => {
        clearTimeout(timeoutId);
        logger.debug('Active ride API response', { data });
        
        // Try multiple response structures
        const rideData = data?.data?.ride || data?.ride || data?.data || {};
        logger.debug('Extracted ride data', { 
          rideData, 
          keys: Object.keys(rideData),
          hasRideId: !!rideData?.ride_id 
        });
        
        if (Object.keys(rideData).length > 0 && (rideData?.ride_id || rideData?._id)) {
          // Check if ride is cancelled or completed - treat as no active ride
          const rideStatus = rideData?.status;
          if (rideStatus === 'cancelled' || rideStatus === 'completed') {
            logger.debug('Ride is cancelled or completed, clearing ride state', { status: rideStatus });
            clearRideState();
            activeRideSheetRef?.current?.close();
            return;
          }
          
          // Use ride_id or _id
          const rideId = rideData?.ride_id || rideData?._id;
          logger.info('Found active ride', { rideId });
          
          setTemp(rideData as TRide);
          animateToMapDirections(rideData);
          
          // Set ride state with the data
          setRide({
            screen: "WAITING",
            data: { waiting: rideData },
          });
          
          // Open the active ride sheet to show waiting for driver
          setTimeout(() => {
            logger.debug('Opening active ride sheet');
            activeRideSheetRef?.current?.open();
          }, 300);
          
          dispatch(
            setAppData({
              isBooking: true,
            })
          );
          
          setTrigger(Math.random());
        } else {
          logger.debug('No active ride found or invalid data');
          clearRideState();
          activeRideSheetRef?.current?.close();
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          logger.debug('Authentication error (401) - token refresh should handle this');
          clearRideState();
          activeRideSheetRef?.current?.close();
          return;
        }
        
        // Silently handle 404 errors (no active ride, etc.)
        if (status === 404) {
          logger.debug("No active ride found (404) - silently handling");
          clearRideState();
          activeRideSheetRef?.current?.close();
          return;
        }
        
        // Log other errors
        logger.error('Active ride error', err, { response: err?.response?.data });
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        clearRideState();
        activeRideSheetRef?.current?.close();
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isFocused && token) {
      // Get locations first (non-blocking) - only when authenticated
      getLocations();
      // Then get active ride
      getActiveRide();
    }
  }, [isFocused, token]);

  // Update maps state when ride data changes (from find-ride flow or Redux store)
  useEffect(() => {
    // Check both local ride state and Redux store for origin/destination
    // ride.data has structure: { waiting: { origin, destination, ... } }
    const waitingData = ride?.data?.waiting || (reduxRide?.data as any)?.waiting;
    const rideStatus = waitingData?.status || temp?.status;
    
    // Clear map if ride is cancelled or completed
    if (rideStatus === 'cancelled' || rideStatus === 'completed') {
      logger.debug('Home: Clearing ride state - ride cancelled or completed', { status: rideStatus });
      clearRideState();
      activeRideSheetRef?.current?.close();
      return;
    }
    
    if (waitingData?.origin?.lat && waitingData?.destination?.lat) {
      const originLat = typeof waitingData.origin.lat === "string" 
        ? parseFloat(waitingData.origin.lat) 
        : waitingData.origin.lat;
      const originLong = typeof waitingData.origin.long === "string" 
        ? parseFloat(waitingData.origin.long) 
        : waitingData.origin.long;
      const destLat = typeof waitingData.destination.lat === "string" 
        ? parseFloat(waitingData.destination.lat) 
        : waitingData.destination.lat;
      const destLong = typeof waitingData.destination.long === "string" 
        ? parseFloat(waitingData.destination.long) 
        : waitingData.destination.long;

      // Only update if coordinates are valid and different from current
      if (originLat !== 0 && originLong !== 0 && destLat !== 0 && destLong !== 0) {
        const newOrigin = { latitude: originLat, longitude: originLong };
        const newDest = { latitude: destLat, longitude: destLong };
        
        // Check if coordinates actually changed
        if (maps.origin.latitude !== originLat || maps.origin.longitude !== originLong ||
            maps.destination.latitude !== destLat || maps.destination.longitude !== destLong) {
          setMaps({
            origin: newOrigin,
            destination: newDest,
          });
          
          // Animate map to show both points
          if (mapRef.current) {
            mapRef.current.fitToCoordinates(
              [newOrigin, newDest],
              {
                edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
                animated: true,
              }
            );
          }
          
          logger.debug('Home: Updated maps from ride data', { origin: newOrigin, destination: newDest });
        }
      }
    }
  }, [
    (reduxRide?.data as any)?.waiting?.origin?.lat, 
    (reduxRide?.data as any)?.waiting?.origin?.long, 
    (reduxRide?.data as any)?.waiting?.destination?.lat, 
    (reduxRide?.data as any)?.waiting?.destination?.long,
    (reduxRide?.data as any)?.waiting?.status,
    ride?.data?.waiting?.origin?.lat, 
    ride?.data?.waiting?.origin?.long, 
    ride?.data?.waiting?.destination?.lat, 
    ride?.data?.waiting?.destination?.long,
    ride?.data?.waiting?.status
  ]);

  const onMapReady = () => {
    logger.info('Map ready');
    setMapReady(true);
    const accuracyInfo = location.accuracy 
      ? ` (accuracy: ${location.accuracy.toFixed(0)}m)` 
      : " (accuracy: unknown)";
    
    logger.debug("Map is ready", {
      location: { 
        lat: location.latitude, 
        lng: location.longitude,
        accuracy: location.accuracy ? `${location.accuracy.toFixed(0)}m` : "unknown",
      },
      mapRegion,
      hasAddress: !!address?.formattedAddress,
      address: address?.formattedAddress || "not available",
    });
    
    if (location.latitude !== 0) {
      // Check if location seems like a mock/test location (common in emulators)
      const isLikelyMockLocation = 
        (location.latitude === 37.4219983 && location.longitude === -122.084) || // Google HQ
        (location.latitude === 37.7749 && location.longitude === -122.4194); // San Francisco
      
      if (isLikelyMockLocation) {
        logger.warn("Detected possible mock/test location (Google HQ or SF)", {
          lat: location.latitude,
          lng: location.longitude,
          note: "If using Android emulator, set custom location via emulator settings or: adb emu geo fix <longitude> <latitude>"
        });
      }
      
      // Always center on user location when map is ready (unless there's a route)
      if (maps.origin.latitude === 0 && maps.destination.latitude === 0) {
        // No active route, center on user location immediately with exact GPS coordinates
        if (hasValidLocation && mapRef.current) {
          const exactLat = location.latitude;
          const exactLng = location.longitude;
          
          logger.debug("onMapReady: Centering on exact GPS coordinates", {
            latitude: exactLat,
            longitude: exactLng,
            accuracy: location.accuracy ? `${location.accuracy.toFixed(0)}m` : 'unknown',
            mapReady: true,
          });
          
          // Try multiple times to ensure it centers on exact location
          // Use longer delays to ensure map is fully rendered
          const centerNow = () => {
            if (mapRef.current && hasValidLocation) {
              try {
                mapRef.current.animateToRegion({
                  latitude: exactLat,
                  longitude: exactLng,
                  ...mapDelta,
                }, 1000);
                logger.debug(`Map centered on exact GPS: ${exactLat}, ${exactLng}${accuracyInfo}`);
              } catch (error) {
                logger.error("Error centering map in onMapReady", error);
              }
            }
          };
          
          // Center with increasing delays to ensure map is fully ready
          setTimeout(centerNow, 100);
          setTimeout(centerNow, 300);
          setTimeout(centerNow, 600);
          setTimeout(centerNow, 1000);
          setTimeout(centerNow, 2000);
        } else {
          logger.warn("onMapReady: Cannot center", { hasValidLocation, mapRef: !!mapRef.current });
        }
      } else {
        // There's a route, but only show it if there's actually a valid active ride
        const waitingData = ride?.data?.waiting as any; // Type assertion for _id which may exist at runtime
        const hasActiveRide = waitingData && (
          waitingData?.ride_id || 
          waitingData?._id ||
          (waitingData?.origin?.lat && waitingData?.destination?.lat)
        );
        
        if (hasActiveRide) {
          logger.debug("onMapReady: Showing route for active ride");
          animateToMapDirections(ride?.data?.waiting);
        } else {
          logger.warn("onMapReady: Maps has coordinates but no active ride - resetting maps");
          // Reset maps if there's no active ride
          setMaps({
            origin: { latitude: 0, longitude: 0 },
            destination: { latitude: 0, longitude: 0 },
          });
          setRouteKey(prev => prev + 1); // Force MapDirections refresh
          // Center on user location instead
          if (hasValidLocation && mapRef.current) {
            const exactLat = location.latitude;
            const exactLng = location.longitude;
            mapRef.current.animateToRegion({
              latitude: exactLat,
              longitude: exactLng,
              ...mapDelta,
            }, 1000);
            logger.debug(`Map centered on user location after reset: ${exactLat}, ${exactLng}`);
          }
        }
      }
      if (address) {
        dispatch(
          setRideUtils({
            user_location: {
              lat: location.latitude?.toString(),
              long: location.longitude?.toString(),
              name: address?.formattedAddress,
            },
          })
        );
      } else {
        logger.warn("Unknown location");
        setRideUtils({
          user_location: {},
        });
      }
      } else {
        // Location is being fetched asynchronously - this is expected
        // The useEffect hook will update the map when location becomes available
        if (locationLoading) {
          logger.debug("Map ready, waiting for GPS location");
        } else {
          logger.warn("Map ready but GPS location not available yet - map will center when GPS locks");
        }
      }
  };

  const onMapError = (error: any) => {
    logger.error("Map Error", error, { 
      message: error?.message,
      fullError: error 
    });
    
    // Check for common API key errors
    if (error?.message?.includes("API key") || error?.message?.includes("authentication")) {
      logger.error("Possible Google Maps API key issue", error, {
        note: "Check if API key is valid in Google Cloud Console, verify 'Maps SDK for Android' is enabled, and check API key restrictions (package name, SHA-1)"
      });
      safeShowMessage({
        type: "danger",
        message: "Map loading error: Check API key configuration",
      });
    }
  };

  const getLocations = () => {
    // Only fetch locations if user is authenticated
    if (!token) {
      logger.debug("Skipping getLocations: No authentication token");
      setNearby([]);
      return;
    }

    apiClient
      // Use relative path so apiClient handles auth + refresh automatically
      .get("locations/drivers-passengers")
      .then(({ data }) => {
        const locations = data?.data?.locations;
        const count = Array.isArray(locations) ? locations.length : 0;
        setNearby(Array.isArray(locations) ? locations : []);
        logger.debug(`Fetched ${count} driver locations`);
      })
      .catch((err) => {
        // Only log non-401 errors (401 is expected when not authenticated)
        if (err?.response?.status !== 401) {
          logger.warn("Error fetching driver locations", { 
            error: err?.response?.data || err?.message 
          });
        }
        // Don't show error messages for location fetching - just set empty array
        setNearby([]);
      });
  };

  useEffect(() => {
    if (isFocused) {
      onMapReady();
      getCurrentUser();
    }
  }, [isFocused, location.latitude, location.accuracy]);
  
  // Update map when location accuracy improves significantly
  useEffect(() => {
    if (isFocused && location.latitude !== 0 && location.accuracy && location.accuracy < 50) {
      // Only update map if we have a good GPS location and origin is not set
      if (maps.origin.latitude === 0) {
        mapRef.current?.animateToRegion({
          latitude: location.latitude,
          longitude: location.longitude,
          ...mapDelta,
        });
        logger.debug(`Map updated to precise location (accuracy: ${location.accuracy.toFixed(0)}m)`);
      }
    }
  }, [location.accuracy, isFocused, maps.origin.latitude]);

  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    apiClient
      .post(CANCEL_BOOKING, { booking_id })
      .then(() => {
        safeShowMessage({
          type: "success",
          message: "Booking cancelled successfully",
        });
        setBooking({});
        setViewbooking({});
        // Clear dismissed state when booking is cancelled
        AsyncStorage.removeItem('dismissedBookingId');
        setDismissedBookingId(null);
        bookingViewSheetRef?.current?.close();
      })
      .then(() => {
        getActiveBooking();
      })
      .catch((err) => {
        const status = err?.response?.status || err?.status;
        
        // Silently handle 404 errors - endpoint may not exist or booking already cancelled
        if (status === 404) {
          logger.debug("Cancel booking endpoint not found (404) - booking may already be cancelled", { booking_id });
          safeShowMessage({
            type: "info",
            message: "Booking may have already been cancelled or completed.",
          });
          setBooking({});
          setViewbooking({});
          bookingViewSheetRef?.current?.close();
          getActiveBooking();
          loading(false);
          return;
        }
        
        logger.error("Cancel booking error", err, { response: err?.response?.data });
        if (err?.response?.data?.message) {
          safeShowMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        } else if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'An error occurred');
          safeShowMessage({
            type: "danger",
            message: errorMessage,
          });
        } else {
          safeShowMessage({
            type: "danger",
            message: "Unable to cancel booking. Please try again.",
          });
        }
      })
      .finally(() => {
        loading(false);
      });
  };

  usePusherChannel({
    channel: `private.payment`,
    visible: !subscription.receipt,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ receipt: true }));
    },
    onEvent: (event) => {
      logger.debug(`Payment event received: ${event}`);
      setTripCompleted(false);
      setPaymentReceipt(true);
    },
  });

  usePusherChannel({
    channel: `private.started`,
    visible: !subscription.started,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ started: true }));
    },
    onEvent: (event) => {
      logger.debug(`Started event received: ${event}`);
      getActiveRide();
    },
  });

  usePusherChannel({
    channel: `private.driver_cancelled`,
    visible: !subscription.driver_cancelled,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ driver_cancelled: true }));
    },
    onEvent: (event) => {
      logger.info(`Driver cancelled event received: ${event}`);
      safeShowMessage({ type: "danger", message: "Driver has cancelled the ride" });
      clearRideState();
      activeRideSheetRef?.current?.close();
      getActiveRide();
    },
  });

  usePusherChannel({
    channel: `private.completed_ride`,
    visible: !subscription.trip_completed,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ trip_completed: true }));
    },
    onEvent: (event) => {
      logger.info(`Completed ride event received: ${event}`);
      setTripCompleted(true);
      clearRideState();
      activeRideSheetRef?.current?.close();
    },
  });

  // Subscribe to ride status updates for active rides
  const activeRideId = temp?.ride_id || (ride?.data?.waiting as any)?.ride_id;
  const rideStatus = (temp?.status as string) || '';
  const rideChannel = activeRideId ? `private.ride.${activeRideId}` : 'private.ride.dummy';
  usePusherChannel({
    channel: rideChannel,
    visible: !!activeRideId && rideStatus !== 'completed' && rideStatus !== 'cancelled',
    onSubscriptionSucceeded: () => {
      if (activeRideId) {
        logger.debug(`Subscribed to ride status updates for ride ${activeRideId}`);
      }
    },
    onEvent: (event) => {
      if (activeRideId) {
        logger.info(`Ride status update event received: ${event}`);
        // Refresh ride data when status changes
        getActiveRide();
      }
    },
  });

  const ViewBooking = (booking_id: string) => {
    bookingViewSheetRef?.current?.open();
    setViewLoading(true);
    
    // First, try to find booking in existing booking data
    const bookingAny = booking as any;
    if (booking?.booking_id === booking_id || bookingAny?.ride_id === booking_id) {
      logger.debug("Using existing booking data", { booking });
      const bookingData = booking as any;
      
      // Parse scheduled_at date if available
      const scheduledAt = bookingData.scheduled_at ? new Date(bookingData.scheduled_at) : null;
      const bookingDate = scheduledAt && !isNaN(scheduledAt.getTime()) 
        ? scheduledAt.toISOString().split('T')[0] 
        : bookingData.booking_date || '';
      const bookingTime = scheduledAt && !isNaN(scheduledAt.getTime())
        ? scheduledAt.toTimeString().split(' ')[0].substring(0, 5)
        : bookingData.booking_time || '';
      
      // Map booking data with driver information
      const mappedBooking = {
        booking_id: booking_id,
        ride_id: bookingData.ride_id || bookingData._id || booking_id,
        pickup_location: bookingData.pickup_location || bookingData.origin || '',
        dropoff_location: bookingData.dropoff_location || bookingData.destination || '',
        booking_date: bookingDate,
        booking_time: bookingTime,
        scheduled_at: bookingData.scheduled_at,
        // Extract fare/cost - handle both number and fare object
        fare: (() => {
          if (typeof bookingData.fare === 'number') return bookingData.fare;
          if (typeof bookingData.cost === 'number') return bookingData.cost;
          if (bookingData.cost && typeof bookingData.cost === 'object' && (bookingData.cost as any).totalFare) {
            return (bookingData.cost as any).totalFare;
          }
          if (bookingData.fare && typeof bookingData.fare === 'object' && (bookingData.fare as any).totalFare) {
            return (bookingData.fare as any).totalFare;
          }
          return 0;
        })(),
        status: bookingData.status || 'requested',
        payment_method: bookingData.payment_method || bookingData.payment_type || 'cash',
        cost: (() => {
          if (typeof bookingData.fare === 'number') return bookingData.fare;
          if (typeof bookingData.cost === 'number') return bookingData.cost;
          if (bookingData.cost && typeof bookingData.cost === 'object' && (bookingData.cost as any).totalFare) {
            return (bookingData.cost as any).totalFare;
          }
          if (bookingData.fare && typeof bookingData.fare === 'object' && (bookingData.fare as any).totalFare) {
            return (bookingData.fare as any).totalFare;
          }
          return 0;
        })(),
        is_started: bookingData.is_started || bookingData.is_ride_started || false,
        // Passenger/Rider information (for driver view)
        username: bookingData.username || bookingData.passenger?.name || bookingData.rider?.name || 'Passenger',
        name: bookingData.username || bookingData.passenger?.name || bookingData.rider?.name || 'Passenger',
        image: bookingData.image || bookingData.passenger?.profileImage || bookingData.rider?.profileImage || null,
        phone: bookingData.phone || bookingData.passenger?.phone || bookingData.rider?.phone || null,
        // Driver information (when driver has accepted)
        driver_id: bookingData.driver_id || null,
        driver_name: bookingData.driver_name || null,
        driver_image: bookingData.driver_image || null,
        driver_phone: bookingData.driver_phone || null,
        driver_rating: bookingData.driver_rating || null,
        driver_rating_count: (bookingData as any)?.driver_rating_count || null,
        driver_total_rides: (bookingData as any)?.driver_total_rides || null,
        driver_union_number: (bookingData as any)?.driver_union_number || null,
        vehicle_type: bookingData.vehicle_type || null,
        vehicle_number: bookingData.vehicle_number || null,
      };
      
      logger.debug("Mapped booking data from existing data", { mappedBooking });
      setViewbooking(mappedBooking);
      setViewLoading(false);
      return;
    }
    
    // If not found in existing data, try API call (but endpoint may not exist)
    apiClient
      .get(DRIVER_BOOKING_ID + booking_id + "/booking")
      .then(({ data }) => {
        logger.debug("View booking data received", { data: data?.data });
        const bookingData = data?.data || {};
        
        // Parse scheduled_at date if available
        const scheduledAt = bookingData.scheduled_at ? new Date(bookingData.scheduled_at) : null;
        const bookingDate = scheduledAt && !isNaN(scheduledAt.getTime()) 
          ? scheduledAt.toISOString().split('T')[0] 
          : bookingData.booking_date || '';
        const bookingTime = scheduledAt && !isNaN(scheduledAt.getTime())
          ? scheduledAt.toTimeString().split(' ')[0].substring(0, 5)
          : bookingData.booking_time || '';
        
        // Map booking data with driver information
        const mappedBooking = {
          booking_id: booking_id,
          ride_id: bookingData.ride_id || bookingData._id || booking_id,
          pickup_location: bookingData.pickup?.address || bookingData.pickup_location || bookingData.origin || '',
          dropoff_location: bookingData.dropoff?.address || bookingData.dropoff_location || bookingData.destination || '',
          booking_date: bookingDate,
          booking_time: bookingTime,
          scheduled_at: bookingData.scheduled_at,
          fare: bookingData.fare || bookingData.cost || 0,
          status: bookingData.status || 'requested',
          payment_method: bookingData.payment_method || bookingData.payment_type || 'cash',
          cost: bookingData.fare || bookingData.cost || 0,
          is_started: bookingData.is_started || bookingData.is_ride_started || false,
          // Passenger/Rider information (for driver view)
          username: bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || 'Passenger',
          name: bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || 'Passenger',
          image: bookingData.passenger?.profileImage || bookingData.rider?.profileImage || bookingData.image || null,
          phone: bookingData.passenger?.phone || bookingData.rider?.phone || bookingData.phone || null,
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
        
        logger.debug("Mapped booking data", { mappedBooking });
        setViewbooking(mappedBooking);
        setViewLoading(false);
      })
      .catch((err) => {
        const status = err?.response?.status || err?.status;
        
        // Silently handle 404 errors - booking not found or endpoint doesn't exist
        if (status === 404) {
          logger.debug("Booking not found (404) - silently handling", { booking_id });
          safeShowMessage({
            type: "info",
            message: "Booking details not available. The booking may have been cancelled or completed.",
          });
          bookingViewSheetRef?.current?.close();
          setViewLoading(false);
          return;
        }
        
        // Handle other errors
        logger.error("View booking error", err, { response: err?.response?.data });
        if (err?.response?.data?.message) {
          safeShowMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        } else if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'An error occurred');
          safeShowMessage({
            type: "danger",
            message: errorMessage,
          });
        } else {
          safeShowMessage({
            type: "danger",
            message: "Unable to load booking details. Please try again.",
          });
        }
        bookingViewSheetRef?.current?.close();
        setViewLoading(false);
      })
      .finally(() => setViewLoading(false));
  };

  useEffect(() => {
    logger.debug("Notification event received", { event: notificationEvent });
    if (notificationEvent?.body !== "") {
      safeShowMessage({ message: notificationEvent?.body, type: "info" });
    }
    getActiveRide();
    if (notificationEvent?.data?.sub_type === "private.completed_ride") {
      // save ride data
      setTripCompleted(true);
      setPaymentReceipt(false);
    }
    if (notificationEvent?.data?.sub_type === "private.payment") {
      // save ride data
      setTripCompleted(false);
      setPaymentReceipt(true);
    }
  }, [notificationEvent]);

  // Use throttled location update hook to prevent rate limiting
  const updateLocation = useThrottledLocationUpdate();

  useEffect(() => {
    if (isFocused) {
      const loc = {
        name: address?.formattedAddress || undefined,
        lat: location?.latitude,
        long: location?.longitude,
      };
      // Only update location if we have valid coordinates
      if (
        typeof loc.lat === 'number' &&
        typeof loc.long === 'number' &&
        !isNaN(loc.lat) &&
        !isNaN(loc.long) &&
        loc.lat !== 0 &&
        loc.long !== 0
      ) {
        updateLocation(loc);
      }
    }
  }, [location?.longitude, location?.latitude, address?.formattedAddress, isFocused, updateLocation]);

  // Memoize driver markers to prevent hooks violation (must be at top level)
  const driverMarkers = useMemo(() => {
    // Limit nearby drivers to prevent memory issues (max 20)
    const limitedNearby = (Array.isArray(nearby) ? nearby : []).slice(0, 20);
    return limitedNearby
      .filter((item: any) => {
        const lat = item?.location?.latitude;
        const lng = item?.location?.longitude;
        return typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);
      })
      .map((item: any, idx: number) => {
        const lat = item?.location?.latitude;
        const lng = item?.location?.longitude;
        // Use a stable, unique key based on driver ID, not coordinates
        const markerKey = item?.id || item?.driver_id || item?.user_id || `driver-marker-${idx}`;
        const vehicleType = item?.vehicle_type || 'car';
        return (
          <Marker
            key={markerKey}
            coordinate={{
              latitude: lat,
              longitude: lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={500}
          >
            <VehicleMarker 
              color={tw.color("base-green") || "#3C8F7C"}
              vehicleType={vehicleType === 'bike' ? 'bike' : vehicleType === 'tricycle' ? 'tricycle' : 'car'}
            />
          </Marker>
        );
      });
  }, [nearby]);

  return (
    <>
      <PaymentReceiptModal
        // saved ride data
        cost={temp?.cost}
        visible={paymentReceipt}
        back={() => setPaymentReceipt(false)}
        feeback={() => {
          dispatch(
            setAppData({
              isBooking: true,
            })
          );
          setPaymentReceipt(false);
          setRide((prev) => ({ ...prev, screen: "REVIEW" }));
          activeRideSheetRef?.current?.open();
        }}
      />
      <TripCompletedModal
        // saved ride data
        cost={temp.cost}
        visible={tripCompleted}
        view="passenger"
        action={() => {
          dispatch(
            setAppData({
              isBooking: true,
            })
          );
          setTripCompleted(false);
          // setRide((prev) => ({ ...prev, screen: "" }));
        }}
        onClose={() => setTripCompleted(false)}
      />

      <DriverBookingSheet
        bottomSheetRef={bookingViewSheetRef}
        data={viewbooking}
        isloading={viewLoading}
        cancel={(booking_id, loading) => CancelBooking(booking_id, loading)}
        viewBooking={(booking_id) => ViewBooking(booking_id)}
        accepted={!!viewbooking?.driver_id || viewbooking?.status === 'accepted'}
      />

      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <StatusBar barStyle="dark-content" backgroundColor={"transparent"} />
        <MapView
          key={mapKey}
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          // Use GPS location if available, otherwise use default region
          // The key prop will force re-render when location changes significantly
          initialRegion={mapRegion}
          style={StyleSheet.absoluteFillObject}
          onMapReady={onMapReady}
          mapType="standard"
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          showsBuildings={true}
          showsTraffic={true}
          showsIndoors={false}
          showsPointsOfInterest={true}
          toolbarEnabled={false}
          loadingEnabled={true}
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
          minZoomLevel={14}
          maxZoomLevel={20}
          followsUserLocation={false}
          // Enable map gestures for better UX
          moveOnMarkerPress={false}
          // Apply custom map style for cleaner appearance
          {...Platform.select({
            android: {
              // Apply custom style only after map is ready to prevent rendering issues
              ...(mapReady && { customMapStyle: LIGHT_MAP_STYLE }),
              zoomControlEnabled: true,
              cacheEnabled: true,
            },
            ios: {
              // iOS can handle more complex styles
              customMapStyle: LIGHT_MAP_STYLE,
            },
          })}
        >
          {/* Custom User Location Marker with Pulse */}
          {hasValidLocation && (
            <Marker
              key={`user-location-marker-${location.latitude}-${location.longitude}`}
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
              tracksViewChanges={false}
              zIndex={1000}
            >
              <UserLocationMarker
                coordinate={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                }}
              />
            </Marker>
          )}

          {/* Only show POI markers when destination is selected */}
          {maps.destination.latitude !== 1 && maps.destination.latitude !== 0 && (
            <POIMarkers />
          )}
          
          {/* Only show driver markers when destination is selected (Bolt-style) */}
          {maps.destination.latitude !== 1 && maps.destination.latitude !== 0 && driverMarkers}
          
          {/* Show route during ride - from pickup to destination when ride is in progress */}
          {/* Only render if we have valid ride data and coordinates */}
          {temp?.ride_id && 
           temp?.is_ride_started && 
           temp?.origin && 
           temp?.destination &&
           typeof temp.origin.lat !== 'undefined' &&
           typeof temp.origin.long !== 'undefined' &&
           typeof temp.destination.lat !== 'undefined' &&
           typeof temp.destination.long !== 'undefined' &&
           temp?.status !== 'cancelled' && 
           temp?.status !== 'completed' && (
            <MapDirections
              key={`route-${routeKey}-${temp.ride_id}`}
              check={true}
              origin={{
                latitude: typeof temp.origin.lat === 'string' ? parseFloat(temp.origin.lat) : temp.origin.lat,
                longitude: typeof temp.origin.long === 'string' ? parseFloat(temp.origin.long) : temp.origin.long,
              }}
              destination={{
                latitude: typeof temp.destination.lat === 'string' ? parseFloat(temp.destination.lat) : temp.destination.lat,
                longitude: typeof temp.destination.long === 'string' ? parseFloat(temp.destination.long) : temp.destination.long,
              }}
            />
          )}
          
          {/* Show route from origin to destination when both are selected (for booking) */}
          {/* Only render if we have valid coordinates and active ride */}
          {maps.origin.latitude !== 0 && 
           maps.origin.longitude !== 0 &&
           maps.destination.latitude !== 0 && 
           maps.destination.longitude !== 0 &&
           maps.destination.latitude !== 1 && 
           maps.destination.longitude !== 1 &&
           maps.destination.latitude !== maps.origin.latitude &&
           maps.destination.longitude !== maps.origin.longitude &&
           !temp?.is_ride_started &&
           temp?.status !== 'cancelled' && 
           temp?.status !== 'completed' &&
           ((ride?.data?.waiting as any)?.ride_id || (ride?.data?.waiting as any)?._id || temp?.ride_id) && (
            <MapDirections
              key={`route-${routeKey}-booking`}
              check={true}
              origin={maps.origin}
              destination={maps.destination}
            />
          )}
          
          {/* Real-time Driver Tracking - shows driver location and route */}
          {/* Only render if we have valid ride data and driver is accepted */}
          {temp?.ride_id && 
           temp?.accepted_by_driver && 
           temp?.origin &&
           typeof temp.origin.lat !== 'undefined' &&
           typeof temp.origin.long !== 'undefined' &&
           temp?.status !== 'cancelled' && 
           temp?.status !== 'completed' && (
            <DriverTracking
              rideId={temp.ride_id}
              pickupLocation={{
                lat: temp.origin.lat,
                long: temp.origin.long,
              }}
              destinationLocation={temp?.destination ? {
                lat: temp.destination.lat,
                long: temp.destination.long,
              } : undefined}
              mapRef={mapRef}
              showRoute={true}
              isRideInProgress={temp?.is_ride_started || false}
            />
          )}
        </MapView>

        <View
          style={tw.style(`absolute top-0 right-0 left-0`, {
            display: isBooking ? "none" : "flex",
            marginTop: StatusBar.currentHeight || 0,
          })}
        >
          {/* Top Header Bar */}
          <View
            style={tw.style(
              `flex-row items-center justify-between px-4 h-[56px] bg-transparent`
            )}
          >
            {/* Search/Destination Input - Extended width */}
            <TouchableOpacity
              onPress={() => {
                // Open find ride modal
                dispatch(setAppData({ isBooking: true }));
                setTimeout(() => {
                  rideSheetRef?.current?.open();
                }, 100);
              }}
              style={tw.style(
                `flex-1 mr-3 bg-white rounded-full flex-row items-center`,
                {
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }
              )}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="magnify"
                size={20}
                color="#757575"
                style={tw`mr-3`}
              />
              <Text style={tw.style(`text-[#212121] text-base`, { fontFamily: "RobotoRegular" })}>
                Where to?
              </Text>
            </TouchableOpacity>

            {/* Notification Button */}
            <TouchableOpacity
              onPress={() => router.push("/(app)/notifications")}
              style={tw`bg-white w-[40px] h-[40px] rounded-full items-center justify-center shadow-lg relative`}
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={20}
                color="#1F2937"
              />
              {/* Notification badge can be added here */}
            </TouchableOpacity>
          </View>

          {/* Show booking info if exists and not dismissed */}
          {Object.keys(booking).length > 0 && 
           booking?.status !== 'cancelled' && 
           booking?.status !== 'completed' &&
           dismissedBookingId !== booking?.booking_id && (
            <View style={tw`bg-white p-4 shadow-xl relative`}>
              {/* X button to dismiss */}
              <TouchableOpacity
                onPress={async () => {
                  const bookingId = booking?.booking_id || '';
                  if (bookingId) {
                    await AsyncStorage.setItem('dismissedBookingId', String(bookingId));
                    setDismissedBookingId(String(bookingId));
                    setBooking({});
                    logger.debug('Booking dismissed by user', { bookingId: String(bookingId) });
                  }
                }}
                style={tw`absolute top-2 right-2 z-10 w-8 h-8 items-center justify-center`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <AntDesign name="close" size={18} color="#666" />
              </TouchableOpacity>
              <View style={tw`flex-row justify-between`}>
                <View style={tw`flex-1`}>
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
                    {booking?.booking_date && booking.booking_date !== '' && booking.booking_date !== 'Select Date'
                      ? formatBookingDate(booking.booking_date)
                      : (booking as any)?.scheduled_at 
                        ? (() => {
                            try {
                              const date = new Date((booking as any).scheduled_at);
                              if (!isNaN(date.getTime())) {
                                return formatBookingDate(date.toISOString().split('T')[0]);
                              }
                            } catch {}
                            return "Select Date";
                          })()
                        : "Select Date"}
                  </Text>
                  
                  {/* Driver Status Section */}
                  <View style={tw`mt-3`}>
                    {booking?.driver_id ? (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            dispatch(
                              setRideUtils({ driver_id: booking?.driver_id })
                            );
                            setRide((prev) => ({ ...prev, screen: "DRIVER" }));
                            setTimeout(() => {
                              activeRideSheetRef?.current?.open();
                            }, 1000);
                          }}
                          style={tw`px-4 py-1.5 self-start border border-base-green rounded-[8px]`}
                        >
                          <Text
                            style={tw.style(`text-sm text-base-green`, {
                              fontFamily: "RobotoBold",
                            })}
                          >
                            View Driver
                          </Text>
                        </TouchableOpacity>
                        {(booking as any)?.driver_name && (
                          <View style={tw`mt-2`}>
                            <Text
                              style={tw.style(`text-xs text-[#666]`, {
                                fontFamily: "RobotoRegular",
                              })}
                            >
                              Driver: {(booking as any).driver_name}
                            </Text>
                            {(booking as any)?.vehicle_type && (
                              <Text
                                style={tw.style(`text-xs text-[#999] mt-1`, {
                                  fontFamily: "RobotoRegular",
                                })}
                              >
                                Vehicle: {(booking as any).vehicle_type}
                              </Text>
                            )}
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={tw`px-4 py-1.5 self-start border border-gray-300 rounded-[8px] bg-gray-50`}>
                        <Text
                          style={tw.style(`text-sm text-gray-600`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          No driver accepted yet
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={tw`basis-[40%] ml-4`}>
                  <Text
                    style={tw.style(`text-[15px] text-[#484C52] text-right mb-2`, {
                      fontFamily: "RobotoBold",
                    })}
                    numberOfLines={3}
                  >
                    {booking?.dropoff_location && booking.dropoff_location.trim() !== '' && !booking.dropoff_location.toLowerCase().includes('select')
                      ? booking.dropoff_location
                      : "Drop-off location"}
                  </Text>
                  <View style={tw`flex-row items-center justify-end gap-x-1 mb-2`}>
                    <AntDesign
                      name="clock-circle"
                      size={21}
                      color={tw.color("base-green")}
                    />
                    <Text
                      style={tw.style(
                        `text-[15px] text-base-green text-right`,
                        {
                          fontFamily: "RobotoBold",
                        }
                      )}
                    >
                      {booking?.booking_time && booking.booking_time !== '' && booking.booking_time !== 'Select Time'
                        ? formatBookingTime(booking.booking_time)
                        : (booking as any)?.scheduled_at 
                          ? (() => {
                              try {
                                const date = new Date((booking as any).scheduled_at);
                                if (!isNaN(date.getTime())) {
                                  return formatBookingTime(date.toTimeString().split(' ')[0].substring(0, 5));
                                }
                              } catch {}
                              return "Select Time";
                            })()
                          : "Select Time"}
                    </Text>
                  </View>
                  <Text
                    style={tw.style(`text-[15px] text-[#FDBC14] text-right capitalize mb-2`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {booking?.status === 'scheduled' || booking?.status === 'requested' 
                      ? 'scheduled' 
                      : booking?.status || 'pending'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => ViewBooking(booking?.booking_id as string)}
                    style={tw`px-4 py-1 self-end border border-blue-600 rounded-[8px]`}
                  >
                    <Text
                      style={tw.style(`text-sm text-blue-600`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      Details
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={tw`ml-2 mt-3 pt-3 border-t border-zinc-200`}
                onPress={() => router.push("/booked-rides")}
              >
                <Text
                  style={tw.style(`text-sm text-base-green`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  View all Bookings
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recenter Button (Bottom Right) - Always visible when location is available */}
        {hasValidLocation && location.latitude !== 0 && location.longitude !== 0 && (
          <TouchableOpacity
            onPress={() => {
              if (mapRef.current && hasValidLocation) {
                mapRef.current.animateToRegion(
                  {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    ...mapDelta,
                  },
                  500
                );
                logger.debug('Map recentered to user location', {
                  lat: location.latitude,
                  lng: location.longitude,
                });
              }
            }}
            style={{
              position: 'absolute',
              width: 48,
              height: 48,
              bottom: 240, // Position above action buttons and bottom nav (bottom nav ~80px + buttons ~120px + padding ~40px)
              right: 16,
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 8,
            }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={22}
              color="#424242"
            />
          </TouchableOpacity>
        )}

        {/* Show Active Ride button if there's an active ride, otherwise show Find Ride and Book a Ride buttons */}
        <View
          style={tw.style(
            `flex-col gap-y-2 absolute bottom-6 px-6 right-0 left-0`,
            {
              marginTop: StatusBar.currentHeight,
              display: "flex",
            }
          )}
        >
          {!loading &&
            (temp?.ride_id && Object.keys(temp || {}).length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  dispatch(
                    setAppData({
                      isBooking: true,
                    })
                  );
                  setRide((prev) => ({ ...prev, screen: "WAITING" }));

                  activeRideSheetRef?.current?.open();
                }}
                style={tw`flex-row items-center justify-center gap-x-2 py-4 bg-base-green rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-white`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Active Ride
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => {
                    dispatch(
                      setAppData({
                        isBooking: true,
                      })
                    );
                    rideSheetRef?.current?.open();
                  }}
                  style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
                >
                  <Image
                    resizeMode="contain"
                    source={require("@images/keke-svg.png")}
                    style={tw`w-[30px] h-[30px]`}
                  />

                  <Text
                    style={tw.style(`text-base text-white`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    Find Ride
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    dispatch(
                      setAppData({
                        isBooking: true,
                      })
                    );
                    bookRideSheetRef?.current?.open();
                  }}
                  style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-black bg-white rounded-[8px]`}
                >
                  <Image
                    resizeMode="contain"
                    source={require("@images/bike-svg.png")}
                    style={tw`w-[28px] h-[28px]`}
                  />

                  <Text
                    style={tw.style(`text-base text-black`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    Book a Ride
                  </Text>
                </TouchableOpacity>
              </>
            ))}
        </View>
      </View>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
      <Portal>
        <BookRideSheet
          bottomSheetRef={bookRideSheetRef}
          getActiveBooking={getActiveBooking}
        />
      </Portal>
      <Portal>
        <FindRideSheet
          bottomSheetRef={rideSheetRef}
          getActiveRide={getActiveRide}
        />
      </Portal>
      <Portal>
        <ActiveRideSheet
          key={trigger}
          temp={temp}
          currentView={ride}
          setCurrentView={setRide}
          bottomSheetRef={activeRideSheetRef}
          getActiveRide={getActiveRide}
          clearMap={clearRideState}
        />
      </Portal>
    </>
  );
}
