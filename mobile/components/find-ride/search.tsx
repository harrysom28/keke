import { Animated, Text, TouchableOpacity, View } from "react-native";
import { AppDetailsState, setRideUtils } from "@/store/AppSlice";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Stop,
} from "react-native-svg";
import {
  WINDOW_WIDTH,
  horizontalScale,
  verticalScale,
} from "@/constants/Metrics";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { AntDesign } from "@expo/vector-icons";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import apiClient from "@/utils/apiClient";
import { requestManager } from "@/utils/requestManager";
import { getErrorMessage } from "@/utils/errorHandler";

interface Props {
  action: () => void;
  back: () => void;
}

export const SearchView = ({ action, back }: Props) => {
  const { ride } = useSelector(AppDetailsState);
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const [searchAttempts, setSearchAttempts] = useState(0);
  const leftValue = useRef(new Animated.Value(0)).current;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isMountedRef = useRef(true);
  const maxAttemptsRef = useRef(3); // Track max attempts separately
  const currentAttemptRef = useRef(0); // Track current attempt with ref to avoid stale closures

  const Animate = () => {
    Animated.loop(
      Animated.timing(leftValue, {
        toValue: 280,
        duration: 2000,
        useNativeDriver: false,
      }),
      { iterations: -1 }
    ).start();
  };

  const stopAnimation = () => {
    leftValue.stopAnimation();
  };

  const getDrivers = async () => {
    if (!isMountedRef.current) return;

    // Check multiple possible locations for ride data
    const rideData = ride?.data as any;
    const waitingData = (ride?.data as any)?.waiting;
    const origin = rideData?.origin || waitingData?.origin;
    
    // Check multiple possible sources for vehicle type ID
    const vehicleTypeId = rideData?.vehicle_type_id || 
                        rideData?.vehicle_id || 
                        waitingData?.vehicle_type_id ||
                        waitingData?.vehicle_id ||
                        (rideData as any)?.vehicleTypeId ||
                        (waitingData as any)?.vehicleTypeId;
    const normalizedVehicleTypeId =
      typeof vehicleTypeId === "string" ? vehicleTypeId : String(vehicleTypeId ?? "");
    const shouldSendVehicleTypeId = /^[a-f0-9]{24}$/i.test(normalizedVehicleTypeId);

    if (!origin?.lat || !origin?.long) {
      console.warn('⚠️ No origin location for driver search');
      stopAnimation();
      showMessage({
        type: "warning",
        message: "Please select a pickup location",
        duration: 3000,
      });
      return;
    }
    
    console.log('🔍 Searching for drivers with:', {
      origin: { lat: origin.lat, long: origin.long },
      vehicleTypeId: shouldSendVehicleTypeId ? normalizedVehicleTypeId : 'any',
      hasRideData: !!rideData,
      hasWaitingData: !!waitingData,
    });

    try {
      // Create cache key based on location and vehicle type
      const cacheKey = `find-drivers-${origin.lat}-${origin.long}-${shouldSendVehicleTypeId ? normalizedVehicleTypeId : 'any'}`;

      const data = await requestManager.execute(
        cacheKey,
        async () => {
          const params: any = {
            loc_lat: origin.lat,
            loc_long: origin.long,
          };
          
          // Only include vehicleTypeId when it's a valid Mongo ObjectId
          if (shouldSendVehicleTypeId) {
            params.vehicleTypeId = normalizedVehicleTypeId;
          }
          
          console.log('📤 Calling find-driver API with params:', params);
          
          const response = await apiClient.get('booking/find-driver', {
            params,
          });
          return response.data;
        },
        5000 // Cache for 5 seconds
      );

      if (!isMountedRef.current) return;

      const drivers = data?.data?.drivers || [];
      console.log('✅ Found drivers:', drivers.length);

      if (drivers.length > 0) {
        // Reset attempts on success
        currentAttemptRef.current = 0;
        setSearchAttempts(0);
        dispatch(setRideUtils({ drivers }));
        stopAnimation();
        action();
      } else {
        // Increment attempt counter
        currentAttemptRef.current += 1;
        const currentAttempt = currentAttemptRef.current;
        
        // No drivers found - retry up to 3 times with delay
        if (currentAttempt < maxAttemptsRef.current) {
          console.log(`🔄 No drivers found, retry ${currentAttempt}/${maxAttemptsRef.current}`);
          setSearchAttempts(currentAttempt);
          
          // Wait 3 seconds before retrying
          searchTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && currentAttemptRef.current < maxAttemptsRef.current) {
              // Clear cache and retry
              requestManager.clear(cacheKey);
              getDrivers();
            }
          }, 3000);
        } else {
          // Max attempts reached
          console.log(`❌ Max attempts (${maxAttemptsRef.current}) reached, stopping search`);
          currentAttemptRef.current = 0;
          setSearchAttempts(0);
          stopAnimation();
          showMessage({ 
            type: "info", 
            message: "No drivers available nearby. Please try again later.",
            duration: 5000,
          });
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      // Increment attempt counter on error
      currentAttemptRef.current += 1;
      const currentAttempt = currentAttemptRef.current;
      
      stopAnimation();
        
      // Handle rate limit gracefully
      if (err?.status === 429 || err?.response?.status === 429) {
        console.warn('⚠️ Rate limited - waiting before retry');
        
        if (currentAttempt < maxAttemptsRef.current) {
          setSearchAttempts(currentAttempt);
          showMessage({
            type: "warning",
            message: "Searching... Please wait.",
            duration: 3000,
          });
          
          // Retry after 5 seconds
          searchTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && currentAttemptRef.current < maxAttemptsRef.current) {
              getDrivers();
            }
          }, 5000);
        } else {
          currentAttemptRef.current = 0;
          setSearchAttempts(0);
          showMessage({
            type: "info",
            message: "No drivers available nearby. Please try again later.",
            duration: 5000,
          });
        }
        return;
      }
        
      // Handle network errors
      if (!err?.response) {
        console.error('⚠️ Network error - unable to reach server');
        
        if (currentAttempt < maxAttemptsRef.current) {
          setSearchAttempts(currentAttempt);
          showMessage({
            type: "warning",
            message: "Unable to connect. Please check your connection.",
            duration: 5000,
          });
          
          // Retry after 3 seconds
          searchTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && currentAttemptRef.current < maxAttemptsRef.current) {
              getDrivers();
            }
          }, 3000);
        } else {
          currentAttemptRef.current = 0;
          setSearchAttempts(0);
          showMessage({
            type: "info",
            message: "No drivers available nearby. Please try again later.",
            duration: 5000,
          });
        }
        return;
      }
        
      // Silently handle 404s
      if (err?.response?.status === 404) {
        console.log('Resource not found (404) - silently handling');
        currentAttemptRef.current = 0;
        setSearchAttempts(0);
        return;
      }

      // Show error for other failures
      if (currentAttempt < maxAttemptsRef.current) {
        setSearchAttempts(currentAttempt);
        const errorMessage = getErrorMessage(err, 'Failed to search for drivers');
        showMessage({
          type: "danger",
          message: errorMessage,
          duration: 5000,
        });
      } else {
        currentAttemptRef.current = 0;
        setSearchAttempts(0);
        showMessage({
          type: "info",
          message: "No drivers available nearby. Please try again later.",
          duration: 5000,
        });
      }
    }
  };

  const getDestinationDetails = async () => {
    if (!isMountedRef.current) return;

    // Check multiple possible locations for ride data
    const rideData = ride?.data as any;
    const waitingData = (ride?.data as any)?.waiting;
    const origin = rideData?.origin || waitingData?.origin;
    const destination = rideData?.destination || waitingData?.destination;
    
    // Check multiple possible sources for vehicle type ID
    const vehicleTypeId = rideData?.vehicle_type_id || 
                        rideData?.vehicle_id || 
                        waitingData?.vehicle_type_id ||
                        waitingData?.vehicle_id ||
                        (rideData as any)?.vehicleTypeId || 
                        (waitingData as any)?.vehicleTypeId ||
                        "1";
    const normalizedVehicleTypeId =
      typeof vehicleTypeId === "string" ? vehicleTypeId : String(vehicleTypeId ?? "");
    const shouldSendVehicleTypeId = /^[a-f0-9]{24}$/i.test(normalizedVehicleTypeId);

    if (!origin || !destination) {
      // No route info, just search for drivers
      await getDrivers();
      return;
    }

    try {
      const originLat = parseFloat(String(origin.lat));
      const originLng = parseFloat(String(origin.long));
      const destLat = parseFloat(String(destination.lat));
      const destLng = parseFloat(String(destination.long));

      // Validate coordinates
      if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
        console.warn('⚠️ Invalid coordinates, skipping destination details');
        await getDrivers();
        return;
      }

      // Create cache key for destination details
      const cacheKey = `destination-${originLat}-${originLng}-${destLat}-${destLng}-${shouldSendVehicleTypeId ? normalizedVehicleTypeId : 'any'}`;

      const data = await requestManager.execute(
        cacheKey,
        async () => {
          const response = await apiClient.get('booking/destination-details', {
            params: {
              pickupLocation: JSON.stringify({ lat: originLat, lng: originLng }),
              dropoffLocation: JSON.stringify({ lat: destLat, lng: destLng }),
              ...(shouldSendVehicleTypeId ? { vehicleTypeId: normalizedVehicleTypeId } : {}),
            },
          });
          return response.data;
        },
        10000 // Cache for 10 seconds
      );

      if (!isMountedRef.current) return;

      console.log('✅ Destination details loaded');
      
      // Store distance/time/cost info
            dispatch(setRideUtils({ 
              distanceTime: {
                distance: data?.data?.distance,
                duration: data?.data?.duration,
          cost: data?.data?.fare?.totalFare || data?.data?.cost || null,
              }
            }));

      // Continue to search for drivers
      await getDrivers();
    } catch (err: any) {
      console.warn('⚠️ Failed to get destination details:', err?.message);
      
      // Don't let this failure block driver search
      // Continue to search for drivers anyway
      if (isMountedRef.current) {
        await getDrivers();
      }
    }
  };

  const startSearch = async () => {
    if (!isMountedRef.current) return;

    console.log('🔍 Starting driver search');
    // Reset attempts when starting a new search
    currentAttemptRef.current = 0;
    setSearchAttempts(0);
    Animate();
    await getDestinationDetails();
  };

  useEffect(() => {
    isMountedRef.current = true;
    
    // Reset attempts when component mounts or becomes focused
    currentAttemptRef.current = 0;
    setSearchAttempts(0);

    if (isFocused) {
      // Only start search if we haven't exceeded max attempts
      if (currentAttemptRef.current < maxAttemptsRef.current) {
        startSearch();
      }
    }

    return () => {
      isMountedRef.current = false;
      stopAnimation();
      
      // Clear any pending timeouts
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = undefined;
      }
      
      console.log('🧹 SearchView unmounted, cleaning up');
    };
  }, [isFocused]);

  return (
    <View style={tw`w-full`}>
      <View
        style={tw.style(
          `flex-row items-center justify-center bg-white w-full py-5 px-6 rounded-t-[20px]`,
          {
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }
        )}
      >
        <Text
          style={tw.style(
            `text-center text-[16px] text-[#1A1A1A]`,
            {
              fontFamily: "RobotoMedium",
            }
          )}
        >
          {searchAttempts > 0 
            ? `Searching... (attempt ${searchAttempts}/${maxAttemptsRef.current})`
            : "Searching for Drivers around you"
          }
        </Text>
      </View>

      <View style={tw.style(`relative mt-10 mx-auto`, { width: WINDOW_WIDTH * 0.9 })}>
        <Svg
          width="100%"
          height={verticalScale(5)}
          viewBox="0 0 310 5"
          fill="none"
        >
          <Line
            x1={307.88}
            y1={2.82728}
            x2={2.12}
            y2={2.82733}
            stroke="url(#paint0_linear_400_4593)"
            strokeWidth={4.24}
            strokeLinecap="round"
          />
          <Defs>
            <LinearGradient
              id="paint0_linear_400_4593"
              x1={0}
              y1={0.707302}
              x2={308.5}
              y2={0.707274}
              gradientUnits="userSpaceOnUse"
            >
              <Stop stopColor="#3C8F7C" />
              <Stop offset={1} stopOpacity={0.2} />
            </LinearGradient>
          </Defs>
        </Svg>

        <Animated.View
          style={tw.style(`absolute -top-[5px]`, {
            left: leftValue,
          })}
        >
          <Svg width={15} height={15} viewBox="0 0 15 15" fill="none">
            <Circle cx={7.5} cy={7.5} r={7.5} fill="#3C8F7C" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
};
