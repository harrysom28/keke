import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Switch,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppDetailsState, setAppData, setSubscriptionUtils } from "@/store/AppSlice";
import {
  CLOSEST_BOOKING_ASSIGNED,
  DRIVER_ACTIVE_RIDE,
  DRIVER_BOOKING_ID,
  DRIVER_CANCEL_BOOKING,
  DRIVER_EARNINGS,
} from "@/constants";
import { Defs, Line, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { TBooking, TDriverActiveRide, TDriverStats } from "@/types";
import {
  formatBookingDate,
  formatBookingTime,
  getLocalBookingDateAndTime,
} from "@/lib/formatBookingDateTime";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmergencyModal from "@/app/(app)/(tabs)/(home)/_modals/emergencyModal";
import { Portal } from "@gorhom/portal";
import axios from "axios";
import apiClient from "@/utils/apiClient";
import {
  getActiveRideId,
  getRideStatusLower,
  isActiveRidePayloadStale,
  isRestorableRideStatus,
  isTerminalRideStatus,
} from "@/utils/activeRidePayload";
import { getGreeting } from "@/lib/getGreeting";
import { router } from "expo-router";
import { postAcceptScheduledBooking } from "@/utils/acceptScheduledBooking";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import usePusherChannel from "@/hooks/usePusherChannel";
import { markInitialDriverRouteHandled } from "@/utils/driverInitialRoute";
import { ensureForegroundLocationAccess } from "@/utils/locationPermission";

/** Map schedule/closest API shape (ride_id, nested pickup/dropoff, scheduled_at) to home card fields. */
function mapClosestBookingForHome(raw: Record<string, unknown>): Partial<TBooking> & Record<string, unknown> {
  const rideId = String(raw.ride_id ?? raw.booking_id ?? "");
  const scheduledAt = raw.scheduled_at as string | Date | undefined | null;
  const { booking_date, booking_time } = getLocalBookingDateAndTime(scheduledAt);
  const pickup = raw.pickup as { address?: string } | undefined;
  const dropoff = raw.dropoff as { address?: string } | undefined;
  const origin =
    (typeof pickup?.address === "string" && pickup.address.trim()) ||
    (typeof raw.pickup_location === "string" && String(raw.pickup_location).trim()) ||
    (typeof raw.origin === "string" && String(raw.origin).trim()) ||
    "";
  const destination =
    (typeof dropoff?.address === "string" && dropoff.address.trim()) ||
    (typeof raw.dropoff_location === "string" && String(raw.dropoff_location).trim()) ||
    (typeof raw.destination === "string" && String(raw.destination).trim()) ||
    "";
  const passenger = raw.passenger as { name?: string } | undefined;

  return {
    ...raw,
    booking_id: rideId,
    ride_id: rideId,
    booking_date,
    booking_time,
    origin,
    pickup_location: origin,
    destination,
    dropoff_location: destination,
    status: typeof raw.status === "string" ? raw.status : String(raw.status ?? ""),
    scheduled_at: scheduledAt as string | undefined,
    username: passenger?.name ?? (raw.username as string | undefined),
    name: passenger?.name ?? (raw.name as string | undefined),
  } as Partial<TBooking> & Record<string, unknown>;
}

const Home = () => {
  const insets = useSafeAreaInsets();
  const { apiConfig, notificationEvent, getCurrentUser } = useContext(AppContext);
  const isFocused = useIsFocused();

  useEffect(() => {
    markInitialDriverRouteHandled();
  }, []);
  const { subscription, unread_count, driverTimeOnlineFromPusher } =
    useSelector(AppDetailsState);
  const [activeRide, setActiveRide] = useState<Partial<TDriverActiveRide>>({});
  const [booking, setBooking] = useState<Partial<TBooking>>({});
  const [viewbooking, setViewbooking] = useState<Partial<TBooking>>({});
  const [rloading, setRLoading] = useState(false);
  const [vloading, setVLoading] = useState(false);
  const [changed, setChange] = useState(false);
  const [activity, setActivity] = useState<Partial<TDriverStats & { is_online?: boolean; is_available?: boolean; verification_status?: string; documents_verified?: boolean }>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const { user } = useSelector(AuthState);
  const dispatch = useDispatch();
  const notificationEventMountGuardRef = useRef(false);

  /** Session flag from backend; can stay true while on a job. */
  const sessionOnline = activity?.is_online ?? false;
  /** Matches server checks for accepting rides (see scheduleController / driverController). */
  const isAvailableForRides = activity?.is_available ?? false;
  const availabilityLabel = isAvailableForRides
    ? "Online"
    : sessionOnline
      ? "On a trip"
      : "Offline";
  const isVerified = activity?.verification_status === "approved" && activity?.documents_verified;

  const emergencySheetRef = useRef<BottomSheetMethods>(null);
  const bookingSheetRef = useRef<BottomSheetMethods>(null);

  const leftValue = useRef(new Animated.Value(0)).current;

  const Animate = () => {
    Animated.loop(
      Animated.timing(leftValue, {
        toValue: 280, // New position for `x`
        duration: 3500, // Animation duration in ms
        useNativeDriver: false, // Set to `false` for layout properties like `x`
      }),
      { iterations: -1 } // Infinite iterations
    ).start();
  };

  const normalizeDriverDashboard = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    const earnings = r.earnings as { today?: number; total?: number } | undefined;
    const wallet = r.wallet as { todayEarnings?: number; totalBalance?: number } | undefined;
    const earnedToday =
      (r.earned_today as number) ??
      wallet?.todayEarnings ??
      earnings?.today ??
      0;
    return {
      ...r,
      earned_today: earnedToday,
      total_earnings:
        (r.total_earnings as number) ??
        wallet?.totalBalance ??
        earnings?.total ??
        0,
      time_online: (r.time_online as string) ?? "00h 00m 00s",
    };
  }, []);

  // `getCurrentUser` can be re-created when context state changes; keep a stable ref
  // to avoid effects re-running and creating update loops.
  const getCurrentUserRef = useRef(getCurrentUser);
  useEffect(() => {
    getCurrentUserRef.current = getCurrentUser;
  }, [getCurrentUser]);

  const fetchDriverDashboard = useCallback(() => {
    apiClient
      .get("driver/earnings")
      .then(({ data }) => {
        setActivity(normalizeDriverDashboard(data?.data) as typeof activity);
      })
      .catch((err) => {
        console.log("Driver earnings error:", err?.response?.data);
        const status = err?.response?.status || err?.status;

        if (status === 401) {
          console.log("Authentication error (401) - token refresh should handle this");
          return;
        }

        if (status === 404) {
          console.log("Resource not found (404) - silently handling");
          return;
        }

        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  }, [normalizeDriverDashboard]);

  const patchAvailability = useCallback(
    (nextAvailable: boolean) => {
      setAvailabilityLoading(true);
      apiClient
        .patch("driver/availability", { isAvailable: nextAvailable })
        .then(({ data }) => {
          const driver = data?.data?.driver;
          setActivity((prev) => ({
            ...prev,
            is_online: driver?.is_online ?? prev?.is_online,
            is_available: driver?.is_available ?? prev?.is_available,
          }));
          safeShowMessage({
            type: "success",
            message: driver?.is_available ? "You're now online" : "You're now offline",
          });
          fetchDriverDashboard();
        })
        .catch((err) => {
          const status = err?.response?.status;
          const message = err?.response?.data?.message;
          const errorMessage =
            status === 404 && (message?.toLowerCase().includes("driver") || !message)
              ? "Driver profile not found. Complete your driver registration first."
              : getErrorMessage(err);
          safeShowMessage({ type: "danger", message: errorMessage });
        })
        .finally(() => setAvailabilityLoading(false));
    },
    [fetchDriverDashboard]
  );

  const toggleAvailability = () => {
    if (availabilityLoading) return;
    if (!isVerified) {
      safeShowMessage({
        type: "info",
        message: "Your account is under review. You can go online once approved by admin.",
      });
      return;
    }
    if (isAvailableForRides) {
      Alert.alert(
        "Go offline?",
        "You will stop receiving new ride requests until you go online again. Finish or decline any active offer first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go offline",
            style: "destructive",
            onPress: () => patchAvailability(false),
          },
        ]
      );
      return;
    }
    void (async () => {
      const access = await ensureForegroundLocationAccess("driver", {
        showRationale: true,
      });
      if (!access.granted) {
        return;
      }
      patchAvailability(true);
    })();
  };

  useEffect(() => {
    if (!isFocused) return;
    fetchDriverDashboard();
    getCurrentUserRef.current?.();
    let dashboardTick = 0;
    const id = setInterval(() => {
      fetchDriverDashboard();
      dashboardTick += 1;
      // Profile changes less often than earnings; refresh /me every 60s to stay under API IP limits
      if (dashboardTick % 2 === 0) {
        getCurrentUserRef.current?.();
      }
    }, 30000);
    return () => clearInterval(id);
  }, [isFocused, fetchDriverDashboard]);

  useEffect(() => {
    if (!isFocused) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        fetchDriverDashboard();
        getCurrentUserRef.current?.();
      }
    });
    return () => sub.remove();
  }, [isFocused, fetchDriverDashboard]);

  const getClosestBooking = () => {
    axios
      .get(CLOSEST_BOOKING_ASSIGNED, apiConfig)
      .then(({ data }) => {
        const payload = data?.data;
        const bookingItem = payload?.booking ?? (Array.isArray(payload) ? payload[0] : null);
        if (bookingItem && typeof bookingItem === "object") {
          setBooking(mapClosestBookingForHome(bookingItem as Record<string, unknown>));
        } else {
          setBooking({});
        }
      })
      .catch((err) => {
        console.log('Closest booking error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          return;
        }
        
        // Silently handle 404 errors (no bookings available, driver profile not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          setBooking({});
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      });
  };

  useEffect(() => {
    if (isFocused) {
      getClosestBooking();
    }
  }, [isFocused, changed]);

  const getActiveRide = () => {
    axios
      .get(DRIVER_ACTIVE_RIDE, apiConfig)
      .then(({ data }) => {
        const ridePayload = data?.data?.ride ?? data?.data ?? {};
        const normalized =
          ridePayload &&
          typeof ridePayload === "object" &&
          !Array.isArray(ridePayload)
            ? ridePayload
            : {};
        const record = normalized as Record<string, unknown>;
        const rideId = getActiveRideId(record);
        if (Object.keys(normalized).length === 0 || !rideId) {
          setActiveRide({});
          return;
        }
        if (isActiveRidePayloadStale(record)) {
          setActiveRide({});
          return;
        }
        const st = getRideStatusLower(record);
        if (isTerminalRideStatus(st) || !isRestorableRideStatus(st)) {
          setActiveRide({});
          return;
        }
        setActiveRide(normalized as Partial<TDriverActiveRide>);
      })
      .catch((err) => {
        console.log('Active ride error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          setActiveRide({});
          return;
        }
        
        // Silently handle 404 errors (no active ride, driver profile not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          setActiveRide({});
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        setActiveRide({});
      });
  };

  useEffect(() => {
    if (isFocused) {
      Animate();
      getActiveRide();
      // .finally(() => setLoading(false));
    }
  }, [isFocused]);

  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    axios
      .post(DRIVER_CANCEL_BOOKING, { booking_id }, apiConfig)
      .then(() => {
        bookingSheetRef?.current?.close();
        setViewbooking({});
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
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => loading(false));
  };

  const handleAcceptScheduledBooking = useCallback(
    async (rideId: string, loading: React.Dispatch<React.SetStateAction<boolean>>) => {
      loading(true);
      try {
        const result = await postAcceptScheduledBooking(rideId, apiConfig);
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
          bookingSheetRef.current?.close();
          setViewbooking({});
          setChange((prev) => !prev);
          fetchDriverDashboard();
          return;
        }
        if (result.silent && result.status === 401) {
          console.log("Authentication error (401) - token refresh should handle this");
          return;
        }
        safeShowMessage({
          type: "danger",
          message: result.message || "Could not accept booking.",
        });
      } finally {
        loading(false);
      }
    },
    [apiConfig, fetchDriverDashboard]
  );

  const ViewBooking = (booking_id: string) => {
    const id = String(booking_id || "").trim();
    if (!/^[a-f\d]{24}$/i.test(id)) {
      safeShowMessage({
        type: "warning",
        message: "This booking cannot be opened yet. Pull to refresh or try again shortly.",
      });
      return;
    }
    bookingSheetRef?.current?.open();
    setVLoading(true);
    axios
      .get(DRIVER_BOOKING_ID + id + "/booking", apiConfig)
      .then(({ data }) => {
        const bookingData = data?.data || {};
        
        // Extract pickup location - try multiple sources
        let pickupLocation = '';
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
          bookingData.dropoff?.address,
          bookingData.dropoff_location,
          bookingData.dropoff?.name,
          bookingData.dropoff?.location?.address,
          bookingData.dropoff?.location?.name,
          bookingData.destination,
        ];
        
        for (const source of dropoffSources) {
          if (source && typeof source === 'string' && source.trim() !== '') {
            const lowerSource = source.toLowerCase();
            if (!lowerSource.includes('select') && 
                !(lowerSource.includes('current location') && lowerSource.includes('accuracy'))) {
              dropoffLocation = source.trim();
              break;
            }
          }
        }
        
        // Extract passenger info
        const passengerName = bookingData.passenger?.name || bookingData.rider?.name || bookingData.username || 'Passenger';
        const passengerImage = bookingData.passenger?.profileImage || bookingData.passenger?.image || bookingData.rider?.profileImage || bookingData.rider?.image || null;
        const passengerPhone = bookingData.passenger?.phone || bookingData.rider?.phone || bookingData.phone || null;
        
        const { booking_date: bookingDate, booking_time: bookingTime } = getLocalBookingDateAndTime(bookingData.scheduled_at) || {};
        const finalBookingDate = bookingDate || bookingData.booking_date || '';
        const finalBookingTime = bookingTime || bookingData.booking_time || '';
        
        setViewbooking({
          ...bookingData,
          booking_id: id,
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          origin: pickupLocation,
          destination: dropoffLocation,
          booking_date: finalBookingDate,
          booking_time: finalBookingTime,
          username: passengerName,
          name: passengerName,
          image: passengerImage,
          passenger_image: passengerImage,
          passenger_name: passengerName,
          phone: passengerPhone,
        });
      })
      .catch((err) => {
        console.log('View booking error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          bookingSheetRef?.current?.close();
          return;
        }
        
        // Silently handle 404 errors (booking not found, etc.)
        if (status === 404) {
          console.log('Resource not found (404) - silently handling');
          bookingSheetRef?.current?.close();
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
        bookingSheetRef?.current?.close();
      })
      .finally(() => setVLoading(false));
  };

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
      getActiveRide();
      getClosestBooking();
    },
  });

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
    if (subType === "ride_requested") {
      dispatch(setAppData({ driverPendingRideOffer: true }));
      router.push("/(driver)/(tabs)/(dashboard)/home-map");
    }
    if (subType === "fare_received" || subType === "ride_completed") {
      fetchDriverDashboard();
      getCurrentUserRef.current?.();
    }
    if (DRIVER_ALERT_SUBTYPES.includes(subType)) {
      safeShowMessage({ message: notificationEvent.body, type: "info" });
      Vibration.vibrate(300);
    }
  }, [notificationEvent, dispatch, fetchDriverDashboard]);

  const { driverRideOfferPusherSeq, driverPendingRideOffer } = useSelector(AppDetailsState);

  useEffect(() => {
    if (!driverPendingRideOffer || !driverRideOfferPusherSeq) return;
    router.push("/(driver)/(tabs)/(dashboard)/home-map");
  }, [driverRideOfferPusherSeq, driverPendingRideOffer]);

  return (
    <>
      <DriverBookingSheet
        bottomSheetRef={bookingSheetRef}
        data={viewbooking}
        isloading={vloading}
        accepted={!!viewbooking?.driver_id || viewbooking?.status === "accepted"}
        action={handleAcceptScheduledBooking}
        cancel={(booking_id, loading) => CancelBooking(booking_id, loading)}
        viewBooking={(booking_id) => ViewBooking(booking_id)}
      />
      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
          paddingTop: insets.top,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="dark-content" />
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
            <TouchableOpacity onPress={() => router.push("/(driver)/notifications")}>
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
        <View
          style={tw`flex-row justify-between items-center bg-[#3C8F7C33] px-4 py-2`}
        >
          <View style={tw`flex-row items-center gap-x-5`}>
            <Svg width={30} height={29} viewBox="0 0 30 29" fill="none">
              <Path
                d="M20 18.5C20 17.1187 16.0825 16 11.25 16M20 18.5C20 19.8813 16.0825 21 11.25 21C6.4175 21 2.5 19.8813 2.5 18.5M20 18.5V24.6713C20 26.095 16.0825 27.25 11.25 27.25C6.4175 27.25 2.5 26.0963 2.5 24.6713V18.5M20 18.5C24.78 18.5 28.75 17.2663 28.75 16V3.5M11.25 16C6.4175 16 2.5 17.1187 2.5 18.5M11.25 16C5.7275 16 1.25 14.7663 1.25 13.5V7.25M11.25 4.75C5.7275 4.75 1.25 5.86875 1.25 7.25M1.25 7.25C1.25 8.63125 5.7275 9.75 11.25 9.75C11.25 11.0163 15.3162 12.25 20.0962 12.25C24.8762 12.25 28.75 11.0163 28.75 9.75M28.75 3.5C28.75 2.11875 24.875 1 20.0962 1C15.3175 1 11.4425 2.11875 11.4425 3.5M28.75 3.5C28.75 4.88125 24.875 6 20.0962 6C15.3175 6 11.4425 4.88125 11.4425 3.5M11.4425 3.5V16.2075"
                stroke="#3C8F7C"
                strokeWidth={2}
              />
            </Svg>
            <View>
              <Text
                style={tw.style(`text-[14px] text-[#484C52]`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Today's Income
              </Text>
              <Text
                style={tw.style(`text-[20px] text-base-green`, {
                  fontFamily: "RobotoBlack",
                })}
              >
                ₦{Number(activity?.earned_today ?? 0).toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={tw`items-end`}>
            <View style={tw`flex-row items-center gap-x-2`}>
              <Text
                style={tw.style(
                  `text-[14px]`,
                  isAvailableForRides
                    ? `text-base-green`
                    : sessionOnline
                      ? `text-amber-700`
                      : `text-[#484C52]`,
                  { fontFamily: "RobotoBold" }
                )}
              >
                {availabilityLabel}
              </Text>
              <Switch
                value={isAvailableForRides}
                onValueChange={toggleAvailability}
                disabled={availabilityLoading || !isVerified}
                trackColor={{
                  false: tw.color("bg-gray-300") ?? "#d1d5db",
                  true: tw.color("bg-base-green") ?? "#3C8F7C",
                }}
                thumbColor="#fff"
              />
            </View>
            <Text
              style={tw.style(`text-[16px] text-[#484C52]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {driverTimeOnlineFromPusher ??
                activity?.time_online ??
                "00h 00m"}
            </Text>
          </View>
        </View>

        {!isVerified && (
          <View style={tw`px-4 pt-2 pb-1`}>
            <Text
              style={tw.style("text-sm text-amber-600", { fontFamily: "RobotoRegular" })}
              numberOfLines={2}
            >
              Account under review. You can go online once approved.
            </Text>
          </View>
        )}

        <View style={tw`mt-6 px-4`}>
          <Text
            style={tw.style(`text-[16px] text-black`, {
              fontFamily: "RobotoBold",
            })}
          >
            Make Extra Money
          </Text>
          <View style={tw`flex-row justify-between items-center my-2`}>
            <Pressable
              style={tw`w-[48%]`}
              onPress={() => router.push("/(driver)/dailyActivities")}
            >
              <ImageBackground
                source={require(`@images/dchallenge.png`)}
                imageStyle={tw`rounded-[10px]`}
                style={tw`flex-col justify-end w-full h-[100px]`}
              >
                <Text
                  style={tw.style(`text-[16px] text-white p-2`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Daily Challenge
                </Text>
              </ImageBackground>
            </Pressable>
            <Pressable
              style={tw`w-[48%]`}
              onPress={() => router.push("/(driver)/(tabs)/bookings")}
            >
              <ImageBackground
                source={require(`@images/schallenge.png`)}
                imageStyle={tw` rounded-[10px]`}
                style={tw`flex-col justify-end w-full h-[100px]`}
              >
                <Text
                  style={tw.style(`text-[16px] text-white p-2`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Schedule Challenge
                </Text>
              </ImageBackground>
            </Pressable>
          </View>

          <View
            style={tw.style(
              `flex-col gap-y-3 bg-white p-4 mt-4 rounded-[10px]`,
              {
                elevation: 4,
                display: Object.keys(activeRide).length > 0 ? "flex" : "none",
              }
            )}
          >
            <View style={tw`flex-row justify-between items-center w-full`}>
              <Text
                style={tw.style(`text-[14px] text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {activeRide?.arrival_distance}
              </Text>
              <Text
                style={tw.style(`text-[14px] text-black`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {activeRide?.arrival_time}
              </Text>
            </View>
            <View style={tw`relative`}>
              <Svg width={"100%"} height={5} viewBox="0 0 310 5" fill="none">
                <Line
                  x1={2.12}
                  y1={2.88}
                  x2={307.88}
                  y2={2.87997}
                  stroke="url(#paint0_linear_538_5518)"
                  strokeWidth={4.24}
                  strokeLinecap="round"
                />
                <Defs>
                  <LinearGradient
                    id="paint0_linear_538_5518"
                    x1={310}
                    y1={5}
                    x2={1.49999}
                    y2={5}
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop stopColor="#3C8F7C" />
                    <Stop offset={1} stopOpacity={0.2} />
                  </LinearGradient>
                </Defs>
              </Svg>

              <Animated.View
                style={tw.style(`absolute  -top-[4.5px]`, {
                  transform: [{ translateX: -5 }], // Apply the translation on X-axis
                  left: leftValue,
                })}
              >
                <Svg width={19} height={15} viewBox="0 0 19 15" fill="none">
                  <Path
                    d="M17.8066 7.35302C17.8067 7.35307 17.8067 7.35313 17.8068 7.3532L1.2625 13.7162L1.26229 13.7163L1.26276 13.7151L3.71495 7.58962L3.80961 7.35317L3.71497 7.11671L1.26314 0.990265L17.8066 7.35302Z"
                    fill="#3C8F7C"
                    stroke="url(#paint0_linear_538_5521)"
                    strokeWidth={1.27263}
                  />
                  <Defs>
                    <LinearGradient
                      id="paint0_linear_538_5521"
                      x1={18.7066}
                      y1={7.35374}
                      x2={6.41295}
                      y2={-4.93989}
                      gradientUnits="userSpaceOnUse"
                    >
                      <Stop stopColor="#3C8F7C" />
                      <Stop offset={1} stopOpacity={0.2} />
                    </LinearGradient>
                  </Defs>
                </Svg>
              </Animated.View>
            </View>
          </View>

          {Object.keys(booking).length === 0 ||
          String(booking?.status ?? "").toLowerCase() === "cancelled" ? (
            <View
              style={tw.style(
                `flex-row items-center  p-4 rounded-[10px] my-2 bg-white`,
                {
                  elevation: 4,
                }
              )}
            >
              <Image
                source={require("@images/place-not-found.png")}
                style={tw.style(`w-[146px] h-[101px]`)}
              />
              <Text
                style={tw.style(`text-[15px] text-base-green`, {
                  fontFamily: "RobotoBold",
                })}
              >
                No Upcoming Schedule
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() =>
                ViewBooking(String(booking?.booking_id || (booking as { ride_id?: string })?.ride_id || ""))
              }
              style={tw.style(
                `flex-row justify-between bg-white p-4 mt-4 rounded-[10px]`,
                {
                  elevation: 4,
                }
              )}
            >
              <View>
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
                  {formatBookingDate(
                    (booking?.booking_date as string) ||
                      ((booking as unknown as { scheduled_at?: string })?.scheduled_at
                        ? getLocalBookingDateAndTime(
                            (booking as unknown as { scheduled_at?: string })?.scheduled_at as string
                          ).booking_date
                        : "")
                  )}
                </Text>
                {String(booking?.status ?? "").toLowerCase() !== "cancelled" && (
                  <TouchableOpacity
                    style={tw`px-4 py-1 mt-2.5 self-start border border-[#FF3810] rounded-[8px]`}
                    onPress={() => {
                      Alert.alert(
                        "Cancel Ride",
                        "Are you sure you want to cancel this booking? This action cannot be undone.",
                        [
                          { text: "No", style: "cancel" },
                          {
                            text: "Yes, Cancel",
                            style: "destructive",
                            onPress: () =>
                              CancelBooking(
                                String(booking?.booking_id || (booking as { ride_id?: string })?.ride_id || ""),
                                setRLoading
                              ),
                          },
                        ]
                      );
                    }}
                  >
                    {rloading ? (
                      <ActivityIndicator color="#FF3810" />
                    ) : (
                      <Text
                        style={tw.style(`text-sm text-[#FF3810]`, {
                          fontFamily: "RobotoBold",
                        })}
                      >
                        Tap to cancel
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <View style={tw`basis-[40%]`}>
                <Text
                  style={tw.style(`text-[15px] text-[#484C52] text-right`, {
                    fontFamily: "RobotoBold",
                  })}
                  numberOfLines={2}
                >
                  {String(booking?.origin || booking?.pickup_location || "")}
                </Text>
                <View style={tw`flex-row items-center justify-end gap-x-1 mt-1`}>
                  <AntDesign
                    name="clock-circle"
                    size={21}
                    color={tw.color("base-green")}
                  />
                  <Text
                    style={tw.style(`text-[15px] text-base-green text-right`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {formatBookingTime(
                      (booking?.booking_time as string) ||
                        ((booking as unknown as { scheduled_at?: string })?.scheduled_at
                          ? getLocalBookingDateAndTime(
                              (booking as unknown as { scheduled_at?: string })?.scheduled_at as string
                            ).booking_time
                          : "")
                    )}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View
          style={tw.style(
            `flex-col gap-y-2 absolute bottom-6 px-6 right-0 left-0 `
          )}
        >
          {Object.keys(activeRide).length > 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/home-map" as any)}
              style={tw.style(
                `flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`
              )}
            >
              <Text
                style={tw.style(`text-base text-white`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Return to Ongoing Ride
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => router.push("/(dashboard)/home-map" as any)}
                style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-white`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Passengers around you
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (booking?.booking_id) {
                    ViewBooking(booking.booking_id as string);
                  } else {
                    router.push("/(driver)/(tabs)/bookings");
                  }
                }}
                style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-black rounded-[8px]`}
              >
                <Text
                  style={tw.style(`text-base text-black`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Schedule Pick-Up
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ImageBackground>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
    </>
  );
};

export default Home;
