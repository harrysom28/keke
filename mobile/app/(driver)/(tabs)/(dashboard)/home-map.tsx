import {
  AppDetailsState,
  setAppData,
  setRideUtils,
  setSubscriptionUtils,
} from "@/store/AppSlice";
import {
  DRIVER_ACTIVE_RIDE,
  DRIVER_PASSENGER_LOCATION,
  LOCATION_UPDATE,
} from "@/constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { BOLT_MAP_STYLE } from "@/constants/mapStyle";
import UserLocationMarker from "@/components/map/UserLocationMarker";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "@/utils/debounce";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import EmergencyModal from "@/app/(app)/(tabs)/(home)/_modals/emergencyModal";
import { useDriverRoute } from "@/hooks/useRoute";
import NewRide from "./_modals/newRide";
import PayChangeSheet from "./_modals/payChange";
import { Portal } from "@gorhom/portal";
import { TDriverActiveRide } from "@/types";
import axios from "axios";
import {
  getActiveRideId,
  getRideStatusLower,
  isActiveRidePayloadStale,
  isRestorableRideStatus,
  isTerminalRideStatus,
} from "@/utils/activeRidePayload";
import { getGreeting } from "@/lib/getGreeting";
import { router } from "expo-router";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useDriverOnlineHeartbeat } from "@/hooks/useDriverOnlineHeartbeat";
import { useIsFocused } from "@react-navigation/native";
import apiClient from "@/utils/apiClient";
import usePusherChannel from "@/hooks/usePusherChannel";
import Svg, { Path } from "react-native-svg";
import {
  consumeInitialDriverRouteRedirect,
  markInitialDriverRouteHandled,
} from "@/utils/driverInitialRoute";
import { LocationPermissionBanner } from "@/components/LocationPermissionBanner";
import { resolveLocationPermissionFromBanner } from "@/utils/locationPermission";
import { requestDriverOfferRefresh } from "@/utils/driverRideOffer";

const mapDelta = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

/**
 * Statuses where the driver is actively handling a ride on the map
 * (accepted → in progress). Pending OFFERS ("requested"/"searching"/"scheduled")
 * are intentionally excluded: the layout-level DriverRideOfferHost is the single
 * source of truth for incoming offers, so home-map must NOT open its own sheet
 * for them (prevents double-open / flicker / race when an offer arrives on the map).
 */
const DRIVER_MAP_ACTIVE_RIDE_STATUSES = new Set([
  "accepted",
  "driver_en_route",
  "arrived",
  "started",
  "in-progress",
  "in_progress",
  "issue_flagged",
]);

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
  const insets = useSafeAreaInsets();
  const {
    subscription,
    unread_count,
    driverPendingRideOffer,
    driverRideOfferPusherPayload,
  } = useSelector(AppDetailsState);
  const { getCurrentUser, apiConfig, notificationEvent } =
    useContext(AppContext);
  const isFocused = useIsFocused();
  const emergencySheetRef = useRef<BottomSheetMethods>(null);
  const notificationEventMountGuardRef = useRef(false);
  const { user } = useSelector(AuthState);
  const dispatch = useDispatch();

  // Cold-start guard: if Expo Router restored this screen as the entry route
  // (e.g. dev reload, deep link with no notification context), bounce back to
  // the dashboard home. Intentional in-session pushes (button tap, ride-offer
  // notification handler) run after the initial route is already marked
  // handled, so they fall through and render normally.
  const [initialRedirecting, setInitialRedirecting] = useState(() => {
    if (driverPendingRideOffer || driverRideOfferPusherPayload) {
      markInitialDriverRouteHandled();
      return false;
    }
    return consumeInitialDriverRouteRedirect();
  });
  useEffect(() => {
    if (!initialRedirecting) return;
    router.replace("/(driver)/(tabs)/(dashboard)/home");
    setInitialRedirecting(false);
  }, [initialRedirecting]);
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

  const mapRef = useRef<MapView>(null);
  const {
    location,
    address,
    locationError: mapLocationError,
    loading: mapLocationLoading,
    getLocation: refreshMapLocation,
  } = useCurrentLocation({ isFocused, purpose: "driver" });
  const [mapReady, setMapReady] = useState(false);

  // Only use actual GPS location - don't show map until we have real coordinates
  // Guard: location can be undefined before the hook provides it or before GPS is ready
  const hasValidLocation = location != null &&
                          location.latitude !== 0 &&
                          location.longitude !== 0 &&
                          !isNaN(location.latitude) &&
                          !isNaN(location.longitude) &&
                          location.accuracy != null &&
                          location.accuracy < 200; // Only use if accuracy is reasonable (< 200m)

  const [sessionOnline, setSessionOnline] = useState(false);
  useEffect(() => {
    if (!isFocused) return;
    apiClient
      .get("driver/earnings")
      .then(({ data }) => {
        setSessionOnline(Boolean(data?.data?.is_online));
      })
      .catch(() => setSessionOnline(false));
  }, [isFocused]);

  useDriverOnlineHeartbeat(
    sessionOnline,
    isFocused,
    location != null &&
      location.latitude !== 0 &&
      location.longitude !== 0 &&
      !isNaN(location.latitude) &&
      !isNaN(location.longitude)
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          address: address?.formattedAddress,
        }
      : null
  );

  const mapRegion = hasValidLocation && location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        ...mapDelta,
      }
    : null; // Used only as initialRegion fallback

  // Center map on actual GPS location when it becomes available
  useEffect(() => {
    if (hasValidLocation && location && mapRef.current) {
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
  }, [hasValidLocation, location?.latitude, location?.longitude, location?.accuracy]);
  const [maps, setMaps] = useState({
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
  });

  const hasRoute =
    maps.origin.latitude !== 0 &&
    maps.origin.longitude !== 0 &&
    maps.destination.latitude !== 0 &&
    maps.destination.longitude !== 0 &&
    Object.keys(ride).length > 0 &&
    ride?.status !== "cancelled" &&
    ride?.status !== "completed";
  const driverCoord =
    hasValidLocation && location
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined;
  const rideStatusNorm = String(ride?.status ?? "")
    .toLowerCase()
    .replace(/-/g, "_");
  const tripStarted =
    !!ride?.is_ride_started ||
    rideStatusNorm === "in_progress" ||
    rideStatusNorm === "started";
  const routeWaypoint =
    tripStarted || rideStatusNorm === "completed"
      ? maps.destination
      : { latitude: maps.origin.latitude, longitude: maps.origin.longitude };
  const { routeCoords, loading: routeLoading, eta: routeEta, distance: routeDistance } =
    useDriverRoute(driverCoord, hasRoute ? routeWaypoint : undefined, {
      enabled: hasRoute,
    });
  const pendingOpenChatRideId = useSelector(
    (s: { App: { pendingOpenChatRideId?: string | null } }) =>
      s.App.pendingOpenChatRideId ?? null
  );
  const [chatOpenKick, setChatOpenKick] = useState(0);
  const routeFittedRef = useRef(false);

  useEffect(() => {
    if (
      routeCoords.length > 0 &&
      mapRef.current &&
      !routeFittedRef.current
    ) {
      routeFittedRef.current = true;
      mapRef.current.fitToCoordinates(routeCoords, {
        edgePadding: { top: 100, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    }
  }, [routeCoords]);

  const prevTripStartedRef = useRef(tripStarted);
  useEffect(() => {
    if (prevTripStartedRef.current !== tripStarted) {
      routeFittedRef.current = false;
      prevTripStartedRef.current = tripStarted;
    }
  }, [tripStarted]);

  useEffect(() => {
    if (!pendingOpenChatRideId || !ride?.ride_id) return;
    if (String(pendingOpenChatRideId) !== String(ride.ride_id)) return;
    setChatOpenKick((k) => k + 1);
    dispatch(setAppData({ pendingOpenChatRideId: null }));
  }, [pendingOpenChatRideId, ride?.ride_id, dispatch]);

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
  }, [isFocused]);

  const getActiveRide = () => {
    axios
      .get(DRIVER_ACTIVE_RIDE, apiConfig)
      .then(({ data }) => {
        console.log(data?.data, "ar");
        const rideDataRaw = data?.data?.ride || data?.data || {};
        const rideData =
          rideDataRaw &&
          typeof rideDataRaw === "object" &&
          !Array.isArray(rideDataRaw)
            ? rideDataRaw
            : {};

        const rideRecord = rideData as Record<string, unknown>;

        const clearDriverMapActiveRide = () => {
          newRideSheetRef.current?.close();
          setRide({});
          setMaps({
            origin: { latitude: 0, longitude: 0 },
            destination: { latitude: 0, longitude: 0 },
          });
          setRouteKey((prev) => prev + 1);
          routeFittedRef.current = false;
          if (hasValidLocation && mapRef.current) {
            setTimeout(() => {
              mapRef.current?.animateToRegion(
                {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  ...mapDelta,
                },
                500
              );
              console.log(
                "Driver map centered on user location after clearing active ride"
              );
            }, 100);
          }
          requestDriverOfferRefresh(dispatch);
        };

        // Backend: driver active-ride should mirror the rider contract — no finished trip should be returned as active.

        if (Object.keys(rideData).length === 0) {
          clearDriverMapActiveRide();
          return;
        }

        const rideId = getActiveRideId(rideRecord);
        if (!rideId) {
          clearDriverMapActiveRide();
          return;
        }

        if (isActiveRidePayloadStale(rideRecord)) {
          clearDriverMapActiveRide();
          return;
        }

        const rideStatus = getRideStatusLower(rideRecord);
        if (isTerminalRideStatus(rideStatus) || !isRestorableRideStatus(rideStatus)) {
          console.log("Driver: Ride terminal or not restorable, clearing map", {
            status: rideStatus,
          });
          clearDriverMapActiveRide();
          return;
        }

        const acceptedActiveRide =
          rideRecord.accepted_by_driver === true ||
          rideRecord.acceptedByDriver === true ||
          DRIVER_MAP_ACTIVE_RIDE_STATUSES.has(rideStatus);

        if (!acceptedActiveRide) {
          // This is a pending ride OFFER (not yet accepted by this driver).
          // Offers are owned exclusively by the layout-level DriverRideOfferHost,
          // so home-map must not open its own sheet here. Keep the map's sheet
          // closed and hand off to the single host (only nudge it when it isn't
          // already showing an offer, to avoid a redundant re-open/flicker).
          newRideSheetRef.current?.close();
          setRide({});
          if (!driverPendingRideOffer) {
            requestDriverOfferRefresh(dispatch);
          }
          return;
        }

        setRide(rideData as Partial<TDriverActiveRide>);
        animateToMapDirections(rideData as Partial<TDriverActiveRide>);
        newRideSheetRef.current?.open();
        dispatch(setAppData({ driverPendingRideOffer: false }));
      })
      .catch((err) => {
        console.log(err?.response?.data);
        // Silently handle 404 errors (driver profile not found, etc.)
        if (err?.response?.status === 404) {
          console.log('Resource not found (404) - silently handling');
          requestDriverOfferRefresh(dispatch);
          return;
        }
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  };

  useEffect(() => {
    if (!isFocused) return;
    getActiveRide();
    getLocations();
  }, [isFocused]);

  const onMapReady = () => {
    console.log('✅ Driver map ready');
    setMapReady(true);
    if (!location) return;
    if (location.latitude !== 0 && location.longitude !== 0) {
      if (maps.origin.latitude === 0) {
        mapRef.current?.animateToRegion({
          latitude: location.latitude,
          longitude: location.longitude,
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

  // TASK 4: Driver foreground alerts - show toast + vibration for critical notifications
  const DRIVER_ALERT_SUBTYPES = [
    "ride_requested",
    "ride_cancelled",
    "passenger_cancelled",
    "driver_cancelled",
    "chat_message",
  ];
  useEffect(() => {
    if (!notificationEventMountGuardRef.current) {
      notificationEventMountGuardRef.current = true;
      return;
    }
    if (!notificationEvent?.body) return;
    const subType = notificationEvent?.data?.subType ?? notificationEvent?.data?.sub_type ?? "";
    if (DRIVER_ALERT_SUBTYPES.includes(subType)) {
      safeShowMessage({ message: notificationEvent.body, type: "info" });
      Vibration.vibrate(300);
    }
    getActiveRide();
  }, [notificationEvent]);

  const UpdateLocation = useCallback((location: {
    name?: string;
    lat: number;
    long: number;
  }) => {
    axios
      .patch(LOCATION_UPDATE, {
        latitude: location.lat,
        longitude: location.long,
        address: location.name ?? '',
      }, apiConfig)
      .catch((err) => {
        console.log(err?.response?.data);

        // Silently handle 404 errors (driver profile not found, etc.)
        if (err?.response?.status === 404) {
          console.log('Resource not found (404) - silently handling');
          return;
        }
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  }, [apiConfig]);

  // Debounced location update to prevent rate limiting
  const debouncedUpdateLocation = useMemo(
    () => debounce((loc: { name?: string; lat: number; long: number }) => {
      UpdateLocation(loc);
    }, 5000), // Update location at most once every 5 seconds
    [UpdateLocation]
  );

  useEffect(() => {
    if (!isFocused) return;
    const lat = location?.latitude;
    const lng = location?.longitude;
    if (lat == null || lng == null || lat === 0 || lng === 0 || isNaN(lat) || isNaN(lng)) {
      return;
    }
    debouncedUpdateLocation({
      name: address?.formattedAddress ?? "",
      lat,
      long: lng,
    });
  }, [location?.latitude, location?.longitude, address?.formattedAddress, isFocused, debouncedUpdateLocation]);

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
      // Clear map immediately
      setMaps({
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 0, longitude: 0 },
      });
      setRouteKey((prev) => prev + 1);
      routeFittedRef.current = false;
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

  const activeDriverRideChannel = useMemo(() => {
    const id = ride?.ride_id;
    if (!id) return "";
    const st = String(ride?.status ?? "").toLowerCase();
    if (st === "completed" || st === "cancelled") return "";
    return `private.ride.${id}`;
  }, [ride?.ride_id, ride?.status]);

  usePusherChannel({
    channel: activeDriverRideChannel || "private.ride.__inactive__",
    visible: isFocused && !!activeDriverRideChannel,
    onEvent: () => {
      getActiveRide();
    },
  });

  if (initialRedirecting) {
    return (
      <View style={tw`flex-1 bg-white items-center justify-center`}>
        <ActivityIndicator size="large" color={tw.color("base-green")} />
      </View>
    );
  }

  return (
    <>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
      <Portal>
        <NewRide
          data={ride}
          bottomSheetRef={newRideSheetRef}
          getActiveRide={getActiveRide}
          routeEta={routeEta}
          routeDistance={routeDistance}
          chatOpenSignal={chatOpenKick}
          onOfferResolved={() =>
            dispatch(setAppData({ driverPendingRideOffer: false }))
          }
        />
      </Portal>
      <Portal>
        <PayChangeSheet bottomSheetRef={payChangeSheetRef} ride={ride} />
      </Portal>
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor={"transparent"} />
        <View style={tw`w-full h-full`} renderToHardwareTextureAndroid>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
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
            {...Platform.select({
              android: {
                ...(mapReady && { customMapStyle: BOLT_MAP_STYLE }),
                zoomControlEnabled: false,
                cacheEnabled: true,
              },
              ios: {
                customMapStyle: BOLT_MAP_STYLE,
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
                key={`${lat}-${long}-${idx}`}
                coordinate={{
                  latitude: typeof lat === "string" ? parseFloat(lat) : lat,
                  longitude: typeof long === "string" ? parseFloat(long) : long,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: tw.color("base-green") || "#3C8F7C",
                    borderWidth: 2,
                    borderColor: "#FFFFFF",
                  }}
                />
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
          
          {/* Pickup and destination markers when on a ride */}
          {hasRoute && maps.origin.latitude !== 0 && (
            <Marker
              coordinate={maps.origin}
              pinColor="#3C8F7C"
              tracksViewChanges={false}
              zIndex={10}
            />
          )}
          {hasRoute && maps.destination.latitude !== 0 && (
            <Marker
              coordinate={maps.destination}
              pinColor="#e74c3c"
              tracksViewChanges={false}
              zIndex={10}
            />
          )}
          {/* Uber-style route polyline (driver → destination), reroutes on deviation >80m */}
          {hasRoute && routeCoords.length > 0 && (
            <>
              <Polyline
                coordinates={routeCoords}
                strokeWidth={7}
                strokeColor="rgba(0,0,0,0.25)"
                lineCap="round"
                lineJoin="round"
                zIndex={1}
              />
              <Polyline
                coordinates={routeCoords}
                strokeWidth={5}
                strokeColor={tw.color("base-green") || "#3C8F7C"}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            </>
          )}
          </MapView>
        </View>
        {routeLoading && hasRoute && (
          <View
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              marginLeft: -20,
              marginTop: -20,
              backgroundColor: "rgba(255,255,255,0.9)",
              padding: 12,
              borderRadius: 8,
              pointerEvents: "none",
            }}
          >
            <ActivityIndicator size="small" color={tw.color("base-green") || "#3C8F7C"} />
          </View>
        )}

        <View
          style={tw.style(`absolute top-0 right-0 left-0`, {
            marginTop: insets.top,
          })}
        >
          {mapLocationError ? (
            <LocationPermissionBanner
              purpose="driver"
              loading={mapLocationLoading}
              onEnable={async () => {
                const ok = await resolveLocationPermissionFromBanner("driver");
                if (ok) await refreshMapLocation({ showRationale: false });
              }}
            />
          ) : null}
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
                onPress={() => router.push("/(driver)/notifications")}
              >
                <View style={{ position: "relative" }}>
                  <MaterialCommunityIcons
                    name="bell-badge-outline"
                    size={24}
                    color="white"
                  />
                  {unread_count > 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -6,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: "#FF3B30",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {unread_count > 9 ? "9+" : unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
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
