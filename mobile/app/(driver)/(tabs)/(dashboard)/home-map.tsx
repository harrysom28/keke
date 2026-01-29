import {
  AppDetailsState,
  setRideUtils,
  setSubscriptionUtils,
} from "@/store/AppSlice";
import {
  DRIVER_ACTIVE_RIDE,
  DRIVER_PASSENGER_LOCATION,
  DRIVER_PENDING_RIDE,
  LOCATION_UPDATE,
} from "@/constants";
import { FontAwesome6, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StatusBar, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { LIGHT_MAP_STYLE } from "@/constants/mapStyle";
import { Platform } from "react-native";
import UserLocationMarker from "@/components/map/UserLocationMarker";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "@/utils/debounce";
import Svg, { Path } from "react-native-svg";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import EmergencyModal from "@/app/(app)/(tabs)/(home)/_modals/emergencyModal";
import MapDirections from "@/components/activeRide/mapDirections";
import NewRide from "./_modals/newRide";
import PayChangeSheet from "./_modals/payChange";
import { Portal } from "@gorhom/portal";
import { TDriverActiveRide } from "@/types";
import axios from "axios";
import { getGreeting } from "@/lib/getGreeting";
import { router } from "expo-router";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useIsFocused } from "@react-navigation/native";
import usePusherChannel from "@/hooks/usePusherChannel";

const mapDelta = { latitudeDelta: 0.007, longitudeDelta: 0.007 };

interface ILocation {
  name: string;
  lat: string;
  long: string;
}

interface IPosition {
  origin?: ILocation;
  destination?: ILocation;
}

export default function HomeScreen() {
  const { subscription } = useSelector(AppDetailsState);
  const { getCurrentUser, apiConfig, notificationEvent } =
    useContext(AppContext);
  const isFocused = useIsFocused();
  const emergencySheetRef = useRef<BottomSheetMethods>(null);
  const { user } = useSelector(AuthState);
  const dispatch = useDispatch();
  // ref

  const newRideSheetRef = useRef<BottomSheetMethods>(null);
  const payChangeSheetRef = useRef<BottomSheetMethods>(null);
  const [ride, setRide] = useState<Partial<TDriverActiveRide>>({});
  const [nearby, setNearby] = useState<
    {
      location: {
        name: string;
        lat: number;
        long: number;
      };
    }[]
  >([]);

  // Only use actual GPS location - don't show map until we have real coordinates
  const hasValidLocation = location.latitude !== 0 && 
                          location.longitude !== 0 && 
                          !isNaN(location.latitude) && 
                          !isNaN(location.longitude) &&
                          location.accuracy !== undefined &&
                          location.accuracy < 200; // Only use if accuracy is reasonable (< 200m)

  const mapRegion = hasValidLocation ? {
    latitude: location.latitude,
    longitude: location.longitude,
    ...mapDelta,
  } : null; // Don't set region until we have valid GPS

  const mapRef = useRef<MapView>(null);
  const { location, address } = useCurrentLocation({ isFocused });
  const [mapReady, setMapReady] = useState(false);

  // Center map on actual GPS location when it becomes available
  useEffect(() => {
    if (hasValidLocation && mapRef.current) {
      console.log("🗺️ Driver map: Centering on GPS location:", {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: `${location.accuracy?.toFixed(0)}m`,
      });
      
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        ...mapDelta,
      }, 500);
    }
  }, [hasValidLocation, location.latitude, location.longitude, location.accuracy]);
  const [maps, setMaps] = useState({
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
  });
  
  // Key to force MapDirections refresh when route is cleared
  const [routeKey, setRouteKey] = useState(0);

  const animateToMapDirections = (item: Partial<TDriverActiveRide>) => {
    let mapDelta = { latitudeDelta: 0.07, longitudeDelta: 0.07 };
    let origin = {
      latitude: parseFloat(item?.origin?.lat?.toString() as string),
      longitude: parseFloat(item?.origin?.long?.toString() as string),
      ...mapDelta,
    };

    mapRef.current?.animateToRegion({ ...origin, ...mapDelta });
    setMaps({
      origin,
      destination: {
        latitude: parseFloat(item?.destination?.lat?.toString() as string),
        longitude: parseFloat(item?.destination?.long?.toString() as string),
      },
    });
  };

  useEffect(() => {
    if (isFocused) {
      onMapReady();
      getCurrentUser();
    }
  }, [isFocused, location.latitude]);

  const getPendingRide = () => {
    axios
      .get(DRIVER_PENDING_RIDE, apiConfig)
      .then(({ data }) => {
        console.log(data?.data, "pp");
        if (data?.data?.length > 0) {
          setRide(data?.data[0]);
          newRideSheetRef.current?.open();
        } else {
          newRideSheetRef.current?.close();
          setRide({});
        }
      })
      .catch((err) => {
        console.log(err?.response?.data);
        // Silently handle 404 errors (driver profile not found, etc.)
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
      });
    // .finally(() => setLoading(false));
  };

  const getActiveRide = () => {
    axios
      .get(DRIVER_ACTIVE_RIDE, apiConfig)
      .then(({ data }) => {
        console.log(data?.data, "ar");
        const rideData = data?.data?.ride || data?.data || {};
        if (Object.keys(rideData).length > 0) {
          // Check if ride is cancelled or completed - treat as no active ride
          const rideStatus = rideData?.status;
          if (rideStatus === 'cancelled' || rideStatus === 'completed') {
            console.log('Driver: Ride is cancelled or completed, clearing map', { status: rideStatus });
            newRideSheetRef.current?.close();
            setRide({});
            setMaps({
              origin: { latitude: 0, longitude: 0 },
              destination: { latitude: 0, longitude: 0 },
            });
            setRouteKey(prev => prev + 1); // Force MapDirections refresh
            // Center map on user location when clearing route
            if (hasValidLocation && mapRef.current) {
              setTimeout(() => {
                mapRef.current?.animateToRegion({
                  latitude: location.latitude,
                  longitude: location.longitude,
                  ...mapDelta,
                }, 500);
                console.log('Driver map centered on user location after clearing cancelled/completed ride');
              }, 100);
            }
            getPendingRide();
            return;
          }
          
          setRide(rideData);
          animateToMapDirections(rideData);
          newRideSheetRef.current?.open();
        } else {
          newRideSheetRef.current?.close();
          setRide({});
          getPendingRide();
          setMaps({
            origin: { latitude: 0, longitude: 0 },
            destination: { latitude: 0, longitude: 0 },
          });
          setRouteKey(prev => prev + 1); // Force MapDirections refresh
          // Center map on user location when clearing route
          if (hasValidLocation && mapRef.current) {
            setTimeout(() => {
              mapRef.current?.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                ...mapDelta,
              }, 500);
              console.log('Driver map centered on user location after clearing route');
            }, 100);
          }
        }
      })
      .catch((err) => {
        console.log(err?.response?.data);
        // Silently handle 404 errors (driver profile not found, etc.)
        if (err?.response?.status === 404) {
          console.log('Resource not found (404) - silently handling');
          setRide({});
          setMaps({
            origin: { latitude: 0, longitude: 0 },
            destination: { latitude: 0, longitude: 0 },
          });
          setRouteKey(prev => prev + 1); // Force MapDirections refresh
          newRideSheetRef.current?.close();
          // Center map on user location
          if (hasValidLocation && mapRef.current) {
            setTimeout(() => {
              mapRef.current?.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                ...mapDelta,
              }, 500);
            }, 100);
          }
          return;
        }
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  };

  useEffect(() => {
    if (isFocused) {
      getActiveRide();
      getLocations();
    }
  }, [isFocused]);

  const onMapReady = () => {
    console.log('✅ Driver map ready');
    setMapReady(true);
    if (location.latitude !== 0) {
      if (maps.origin.latitude === 0) {
        mapRef.current?.animateToRegion({
          latitude: location?.latitude,
          longitude: location?.longitude,
          ...mapDelta,
        });
      } else {
        animateToMapDirections(ride);
      }
      // Format address to a readable place name
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
        console.log("Unknown location");
        setRideUtils({
          user_location: {},
        });
      }
    }
  };

  const getLocations = () => {
    axios
      .get(DRIVER_PASSENGER_LOCATION, apiConfig)
      .then(({ data }) => {
        console.log('Passenger locations response:', data?.data);
        // Backend might return different structures:
        // - { locations: [...] }
        // - { rides: [...] }
        // - Direct array [...]
        // - { pagination: {...}, rides: [...] }
        const locations = data?.data?.locations || data?.data?.rides || (Array.isArray(data?.data) ? data?.data : []);
        setNearby(Array.isArray(locations) ? locations : []);
      })
      .catch((err) => {
        console.log('Passenger locations error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          setNearby([]);
          return;
        }
        
        // Silently handle 404 errors (driver profile not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          setNearby([]);
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        setNearby([]); // Ensure nearby is always an array on error
      });
  };

  useEffect(() => {
    console.log(notificationEvent, "here");
    getActiveRide();
  }, [notificationEvent]);

  const UpdateLocation = useCallback((location: {
    name: string;
    lat: number;
    long: number;
  }) => {
    console.log(location);
    axios
      .post(LOCATION_UPDATE, { location }, apiConfig)
      .then(() => getCurrentUser())
      .catch((err) => {
        console.log(err?.response?.data);

        // Silently handle 404 errors (driver profile not found, etc.)
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
      });
  }, [apiConfig, getCurrentUser]);

  // Debounced location update to prevent rate limiting
  const debouncedUpdateLocation = useMemo(
    () => debounce((loc: { name: string; lat: number; long: number }) => {
      UpdateLocation(loc);
    }, 5000), // Update location at most once every 5 seconds
    [UpdateLocation]
  );

  useEffect(() => {
    if (isFocused) {
      const loc = {
        name: address?.formattedAddress as string,
        lat: location?.latitude,
        long: location?.longitude,
      };
      if (address?.formattedAddress) {
        debouncedUpdateLocation(loc);
      }
    }
  }, [location?.longitude, address?.formattedAddress, isFocused, debouncedUpdateLocation]);

  usePusherChannel({
    channel: `private.passenger_cancelled`,
    visible: !subscription.passenger_cancelled,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ passenger_cancelled: true }));
    },
    onEvent: (event) => {
      console.log(`Event received: ${event}`);
      showMessage({
        type: "danger",
        message: "Passenger has cancelled the ride",
      });
      // Clear map immediately
      setMaps({
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 0, longitude: 0 },
      });
      setRouteKey(prev => prev + 1); // Force MapDirections refresh
      setRide({});
      newRideSheetRef.current?.close();
      // Center map on user location
      if (hasValidLocation && mapRef.current) {
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            ...mapDelta,
          }, 500);
        }, 100);
      }
      getActiveRide();
    },
  });

  return (
    <>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
      <Portal>
        <NewRide
          data={ride}
          bottomSheetRef={newRideSheetRef}
          isActive={ride?.accepted_by_driver as boolean}
          getActiveRide={getActiveRide}
        />
      </Portal>
      <Portal>
        <PayChangeSheet bottomSheetRef={payChangeSheetRef} ride={ride} />
      </Portal>
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor={"transparent"} />
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          region={mapRegion || undefined}
          initialRegion={mapRegion || undefined}
          style={tw`w-full h-full`}
          mapType="standard"
          onMapReady={onMapReady}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          showsBuildings={true}
          showsTraffic={false}
          showsIndoors={false}
          showsPointsOfInterest={true}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
          minZoomLevel={10}
          maxZoomLevel={20}
          followsUserLocation={hasValidLocation && maps.origin.latitude === 0}
          // Android-specific: Only apply minimal custom style when map is ready
          {...Platform.select({
            android: {
              ...(mapReady && { customMapStyle: LIGHT_MAP_STYLE }),
              zoomControlEnabled: false,
              cacheEnabled: true,
            },
            ios: {
              customMapStyle: LIGHT_MAP_STYLE,
            },
          })}
        >
          {Array.isArray(nearby) && nearby.length > 0 && nearby.map((item, idx) => {
            // Handle different location formats from backend
            const lat = item?.location?.lat || item?.location?.latitude;
            const long = item?.location?.long || item?.location?.longitude;
            
            // Skip if coordinates are invalid
            if (!lat || !long) {
              return null;
            }
            
            return (
              <Marker
                key={idx + 1}
                coordinate={{
                  latitude: typeof lat === 'string' ? parseFloat(lat) : lat,
                  longitude: typeof long === 'string' ? parseFloat(long) : long,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: tw.color("base-green") || "#3C8F7C",
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: 'white',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 5,
                }}>
                  <FontAwesome6
                    name="person"
                    size={20}
                    color="white"
                  />
                </View>
              </Marker>
            );
          })}
          
          {/* Show driver's current location - simple blue dot (Bolt-style) */}
          {hasValidLocation && (
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
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
          
          {/* Only show route when driver has accepted a ride and ride is not cancelled/completed */}
          <MapDirections
            key={`route-${routeKey}-driver`}
            check={
              maps.origin.latitude !== 0 && 
              maps.destination.latitude !== 0 && 
              maps.origin.latitude !== maps.destination.latitude && 
              Object.keys(ride).length > 0 &&
              ride?.status !== 'cancelled' && 
              ride?.status !== 'completed'
            }
            origin={maps.origin}
            destination={maps.destination}
          />
        </MapView>

        <View
          style={tw.style(`absolute top-0 right-0 left-0`, {
            marginTop: StatusBar.currentHeight,
          })}
        >
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
              <TouchableOpacity
                onPress={() => router.push("/(app)/notifications")}
              >
                <MaterialCommunityIcons
                  name="bell-badge-outline"
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            disabled={Object.keys(ride).length === 0}
            onPress={() => {
              newRideSheetRef?.current?.open();
            }}
            style={tw.style(
              `flex-row gap-x-4 justify-center items-center mx-6 my-4 px-5 py-3 bg-transparent border border-base-green rounded-[20px]`
            )}
          >
            <Image
              resizeMode="contain"
              source={require("@images/demand-svg.png")}
              style={tw`w-[28px] h-[28px]`}
            />
            <Text
              style={tw.style(`text-base text-black`, {
                fontFamily: "RobotoBold",
              })}
            >
              {Object.keys(ride).length > 0
                ? "Active ride"
                : " Demand is very high"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
