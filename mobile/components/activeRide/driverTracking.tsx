import React, { useEffect, useState, useRef } from "react";
import { View, Text } from "react-native";
import MapView, { Marker } from "react-native-maps";
import CustomMapDirections from "./CustomMapDirections";
import { FontAwesome5 } from "@expo/vector-icons";
import tw from "@/lib/tailwind";
import usePusherChannel from "@/hooks/usePusherChannel";
import { useSelector } from "react-redux";
import { AppDetailsState } from "@/store/AppSlice";
import apiClient from "@/utils/apiClient";

interface DriverLocation {
  lat: number;
  long: number;
  name?: string;
}

interface DriverTrackingProps {
  rideId: string;
  pickupLocation: {
    lat: string | number;
    long: string | number;
  };
  mapRef: React.RefObject<MapView | null>;
  showRoute?: boolean;
  destinationLocation?: {
    lat: string | number;
    long: string | number;
  };
  isRideInProgress?: boolean;
}

export default function DriverTracking({
  rideId,
  pickupLocation,
  mapRef,
  showRoute = true,
  destinationLocation,
  isRideInProgress = false,
}: DriverTrackingProps) {
  const { subscription } = useSelector(AppDetailsState);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial driver location
  const fetchDriverLocation = () => {
    if (!rideId || isRateLimited) return;

    apiClient
      .get("ride/driver-location", {
        params: { rideId: rideId },
      })
      .then(({ data }) => {
        setIsRateLimited(false); // Reset rate limit flag on success
        if (data?.data?.driver_location) {
          const loc = data.data.driver_location.location || data.data.driver_location;
          const driverLat = typeof loc.latitude === "string" ? parseFloat(loc.latitude) : (typeof loc.lat === "string" ? parseFloat(loc.lat) : loc.latitude || loc.lat);
          const driverLong = typeof loc.longitude === "string" ? parseFloat(loc.longitude) : (typeof loc.long === "string" ? parseFloat(loc.long) : loc.longitude || loc.long);
          
          setDriverLocation({
            lat: driverLat,
            long: driverLong,
            name: loc.address || loc.name,
          });
          setEta(data.data.eta);
          setDistance(data.data.distance);
          
          // Animate map to show both driver and pickup
          if (mapRef.current && driverLocation) {
            const pickupLat = typeof pickupLocation.lat === "string" ? parseFloat(pickupLocation.lat) : pickupLocation.lat;
            const pickupLong = typeof pickupLocation.long === "string" ? parseFloat(pickupLocation.long) : pickupLocation.long;
            
            // Calculate bounds to fit both markers
            const minLat = Math.min(driverLat, pickupLat);
            const maxLat = Math.max(driverLat, pickupLat);
            const minLong = Math.min(driverLong, pickupLong);
            const maxLong = Math.max(driverLong, pickupLong);
            
            mapRef.current.fitToCoordinates(
              [
                { latitude: driverLat, longitude: driverLong },
                { latitude: pickupLat, longitude: pickupLong },
              ],
              {
                edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
                animated: true,
              }
            );
          }
        }
      })
      .catch((err) => {
        // Handle rate limiting - stop polling temporarily
        if (err?.response?.status === 429) {
          console.log("⚠️ Rate limited on driver location, stopping polling for 60 seconds");
          setIsRateLimited(true);
          // Stop the interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Resume after 60 seconds
          setTimeout(() => {
            setIsRateLimited(false);
            if (rideId && !isSubscribed && !intervalRef.current) {
              fetchDriverLocation();
              // Restart polling with longer interval
              intervalRef.current = setInterval(() => {
                if (!isRateLimited && !isSubscribed) {
                  fetchDriverLocation();
                }
              }, 60000); // 60 seconds
            }
          }, 60000);
          return;
        }
        // Only log non-401 errors (401 will be handled by apiClient token refresh)
        if (err?.response?.status !== 401) {
          console.log("Error fetching driver location:", err?.response?.data || err?.message);
        }
      });
  };

  // Subscribe to real-time driver location updates
  usePusherChannel({
    channel: `private.ride.${rideId}`,
    visible: !isSubscribed && !!rideId,
    onSubscriptionSucceeded: () => {
      setIsSubscribed(true);
      fetchDriverLocation(); // Fetch initial location
    },
    onEvent: (event) => {
      if (event.eventName === "driver.location") {
        const data = event.data;
        if (data?.driver_location) {
          const loc = data.driver_location;
          setDriverLocation({
            lat: typeof loc.lat === "string" ? parseFloat(loc.lat) : loc.lat,
            long: typeof loc.long === "string" ? parseFloat(loc.long) : loc.long,
            name: loc.name,
          });
          setEta(data.eta);
          setDistance(data.distance);
          
          // Animate map to driver location
          if (mapRef.current) {
            const driverLat = typeof loc.lat === "string" ? parseFloat(loc.lat) : loc.lat;
            const driverLong = typeof loc.long === "string" ? parseFloat(loc.long) : loc.long;
            
            mapRef.current.animateToRegion(
              {
                latitude: driverLat,
                longitude: driverLong,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              1000
            );
          }
        }
      }
    },
  });

  // Fetch driver location periodically as fallback (only if Pusher is not subscribed)
  useEffect(() => {
    if (!rideId) {
      // Cleanup if no rideId
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // If Pusher is subscribed, stop polling (real-time updates are preferred)
    if (isSubscribed) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Cleanup any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Initial fetch
    fetchDriverLocation();
    
    // Set up polling with longer interval to avoid rate limits
    // Only poll if Pusher is not subscribed
    intervalRef.current = setInterval(() => {
      if (!isRateLimited && !isSubscribed) {
        fetchDriverLocation();
      }
    }, 60000); // Poll every 60 seconds to reduce API calls and avoid rate limits

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [rideId, isSubscribed]);

  if (!driverLocation) {
    return null;
  }

  const driverCoords = {
    latitude: driverLocation.lat,
    longitude: driverLocation.long,
  };

  const pickupCoords = {
    latitude: typeof pickupLocation.lat === "string" ? parseFloat(pickupLocation.lat) : pickupLocation.lat,
    longitude: typeof pickupLocation.long === "string" ? parseFloat(pickupLocation.long) : pickupLocation.long,
  };

  const destinationCoords = destinationLocation ? {
    latitude: typeof destinationLocation.lat === "string" ? parseFloat(destinationLocation.lat) : destinationLocation.lat,
    longitude: typeof destinationLocation.long === "string" ? parseFloat(destinationLocation.long) : destinationLocation.long,
  } : null;

  // During ride, show route from driver to destination
  const routeDestination = isRideInProgress && destinationCoords ? destinationCoords : pickupCoords;

  return (
    <>
      {/* Driver Marker */}
      <Marker 
        coordinate={driverCoords} 
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
      >
        <View style={tw`items-center`}>
          <View
            style={tw`bg-base-green rounded-full p-2 items-center justify-center shadow-lg`}
          >
            <FontAwesome5 name="car" size={24} color="white" />
          </View>
          <View
            style={tw`bg-white px-2 py-1 rounded mt-1 shadow-sm border border-gray-200`}
          >
            <Text style={tw.style(`text-xs text-gray-800`, { fontFamily: "RobotoMedium" })}>
              {isRideInProgress ? "Driver (En Route)" : "Driver"}
            </Text>
          </View>
        </View>
      </Marker>

      {/* Route from driver to pickup (before ride) or to destination (during ride) */}
      {showRoute && driverLocation && (
        <CustomMapDirections
          origin={driverCoords}
          destination={routeDestination}
          strokeWidth={4}
          strokeColor={isRideInProgress ? "#3C8F7C" : "#3C8F7C"}
          mode="driving"
        />
      )}
    </>
  );
}

// ETA Display Component
export function DriverETA({ eta, distance }: { eta: number | null; distance: number | null }) {
  if (!eta && !distance) return null;

  const formatETA = (minutes: number | null) => {
    if (!minutes) return "Calculating...";
    if (minutes < 1) return "Less than 1 min";
    if (minutes === 1) return "1 min";
    return `${Math.round(minutes)} mins`;
  };

  const formatDistance = (km: number | null) => {
    if (!km) return "";
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)} km`;
  };

  return (
    <View style={tw`bg-white rounded-lg p-3 shadow-lg border border-gray-200`}>
      <View style={tw`flex-row items-center justify-between`}>
        <View>
          <Text
            style={tw.style(`text-xs text-gray-500`, { fontFamily: "RobotoRegular" })}
          >
            Driver ETA
          </Text>
          <Text
            style={tw.style(`text-lg font-bold text-base-green`, {
              fontFamily: "RobotoBold",
            })}
          >
            {formatETA(eta)}
          </Text>
        </View>
        {distance && (
          <View style={tw`items-end`}>
            <Text
              style={tw.style(`text-xs text-gray-500`, { fontFamily: "RobotoRegular" })}
            >
              Distance
            </Text>
            <Text
              style={tw.style(`text-lg font-bold text-gray-800`, {
                fontFamily: "RobotoBold",
              })}
            >
              {formatDistance(distance)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

