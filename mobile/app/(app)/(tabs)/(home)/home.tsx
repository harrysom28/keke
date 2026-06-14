import {
  DRIVER_BOOKING_ID,
  DRIVER_PASSENGER_LOCATION,
  LOCATION_UPDATE,
} from "@/constants";
import {
  ActivityIndicator,
  AppState,
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
  clearRideState as clearRideStateAction,
  setAppData,
  setRideData,
  setRideUtils,
  setSubscriptionUtils,
} from "@/store/AppSlice";
import MapView from "react-native-maps";
import { HomeMap } from "@/components/map/HomeMap";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useThrottledLocationUpdate } from "@/hooks/useThrottledLocationUpdate";
import Svg, { Path } from "react-native-svg";
import { TBooking, TRide } from "@/types";
import {
  formatBookingDate,
  formatBookingTime,
} from "@/lib/formatBookingDateTime";
import { formatAddressForDisplay } from "@/utils/formatAddressForDisplay";
import { useDispatch, useSelector } from "react-redux";
import apiClient from "@/utils/apiClient";
import {
  getActiveRideId,
  getRideStatusLower,
  isActiveRidePayloadStale,
  isRestorableRideStatus,
  isTerminalRideStatus,
} from "@/utils/activeRidePayload";
import {
  buildRideAcceptedStatusPatch,
  buildRideRematchingStatusPatch,
  mergePusherRideStatusPatch,
  reconcileStaleActiveRideGet,
} from "@/utils/activeRideRealtimeMerge";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ActiveRideSheet from "./_modals/activeRide";
import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import BookRideSheet from "./_modals/bookRide";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import EmergencyModal from "./_modals/emergencyModal";
import FindRideSheet from "./_modals/findRide";
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
import { LocationPermissionBanner } from "@/components/LocationPermissionBanner";
import { resolveLocationPermissionFromBanner } from "@/utils/locationPermission";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import usePusherChannel from "@/hooks/usePusherChannel";
import { useRoute } from "@/hooks/useRoute";
import { haversineKm } from "@/utils/haversine";
import { useFocusRefresh } from "@/hooks/useFocusRefresh";
import { invalidateRecentPlacesCache } from "@/utils/recentPlacesCache";
import { invalidateWalletCache } from "@/utils/walletCache";
import { requestManager } from "@/utils/requestManager";
import {
  getRiderAppCancelToastMessage,
  resolveRideCancelledActor,
  shouldSuppressRiderCancelToast,
} from "@/utils/rideCancellation";

// Max distance (km) for fitting map to route; beyond this we center on pickup to avoid continental zoom
const MAX_FIT_DISTANCE_KM = 150;

/** IDs user cancelled — hide from home preview until list no longer returns them (API can lag behind cancel). */
const SUPPRESSED_HOME_SCHEDULE_IDS_KEY = "suppressedHomeScheduleBookingIds";

async function readSuppressedScheduleBookingIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SUPPRESSED_HOME_SCHEDULE_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x)).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function suppressScheduleBookingForHomePreview(bookingId: string) {
  const id = String(bookingId ?? "").trim();
  if (!id) return;
  const cur = await readSuppressedScheduleBookingIds();
  cur.add(id);
  await AsyncStorage.setItem(
    SUPPRESSED_HOME_SCHEDULE_IDS_KEY,
    JSON.stringify([...cur])
  );
}

function normalizeBookingListStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function isTerminalScheduleListStatus(statusNorm: string): boolean {
  return (
    statusNorm === "cancelled" ||
    statusNorm === "canceled" ||
    statusNorm === "completed" ||
    statusNorm === "rejected" ||
    statusNorm === "failed" ||
    statusNorm === "expired"
  );
}

// Map zoom level - adjusted for better street-level detail visibility
// 0.012-0.015 shows good balance of detail and area coverage (like screenshot)
// Slightly wider home zoom for a calmer default view
const mapDelta = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

interface ILocation {
  name: string;
  lat: string;
  long: string;
}

export type IARide = {
  screen:
    | "WAITING"
    | "SUMMARY"
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
      status?: string;
    };
  };
};
function parsePusherDataPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 88 + Math.max(insets.bottom, 0);
  const isFocused = useIsFocused();
  const refreshActiveRideOnFocus = useFocusRefresh(15_000);
  const refreshActiveBookingOnFocus = useFocusRefresh(30_000);
  const refreshLocationsOnFocus = useFocusRefresh(60_000);
  const refreshCurrentUserOnFocus = useFocusRefresh(120_000);
  const params = useLocalSearchParams<{
    openBookRide?: string;
    openFindRide?: string;
    rebook_dropoff_name?: string;
    rebook_dropoff_lat?: string;
    rebook_dropoff_lng?: string;
  }>();
  const {
    isBooking,
    requestOpenBookRide,
    subscription,
    ride: reduxRide,
    unread_count,
    pendingOpenChatRideId,
  } = useSelector(AppDetailsState);
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
  const mapRef = useRef<MapView | import("@/components/map/MapboxMap").MapboxMapRef | null>(null);
  const milestoneToastShownRef = useRef(false);
  /** Dedupe heavy UI (sheet open, map fit, trigger) when active-ride polls return the same logical state */
  const lastActiveRideUiKeyRef = useRef<string>("");
  /** Skip first notificationEvent effect run so rehydrated stale latest_notification does not toast or trigger ride refresh */
  const notificationEventMountGuardRef = useRef(false);
  /** Set to true right after confirm-ride succeeds so a null active-ride response doesn't immediately
   *  wipe state — the DB write may still be propagating (replica lag) or the first poll fires too fast. */
  const justBookedRef = useRef(false);
  const justBookedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while UI was hydrated from POST confirm-ride but GET active-ride may still be empty (propagation lag). */
  const pendingConfirmHydrationRef = useRef(false);
  const pendingConfirmHydrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const CONFIRM_HYDRATION_TTL_MS = 120_000;
  /** Coalesce GET /booking/active-ride: Pusher events, focus, polling and just-booked retries can all fire
   *  in close succession; a single in-flight request + short min-interval prevents bursting the endpoint. */
  const getActiveRideInFlightRef = useRef(false);
  const getActiveRideLastStartRef = useRef(0);
  /** When Pusher/socket fires during an in-flight GET or inside the min-interval window, run again once. */
  const pendingGetActiveRideRef = useRef(false);
  const GET_ACTIVE_RIDE_MIN_MS = 400;
  const locationRef = useRef({ latitude: 0, longitude: 0 });
  const {
    location,
    address,
    loading: locationLoading,
    locationError,
    getLocation: refreshLocation,
  } = useCurrentLocation({ isFocused, purpose: "rider" });

  locationRef.current = { latitude: location.latitude, longitude: location.longitude };
  const tempRef = useRef<TRide>({} as TRide);
  const [booking, setBooking] = useState<Partial<TBooking>>({});
  const [viewbooking, setViewbooking] = useState<Partial<TBooking>>({});
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(false);
  const [tripCompleted, setTripCompleted] = useState(false);
  const [chatOpenKick, setChatOpenKick] = useState(0);
  const [trigger, setTrigger] = useState(0);
  const [dismissedBookingId, setDismissedBookingId] = useState<string | null>(null);
  const [bookRideOpenVersion, setBookRideOpenVersion] = useState(0);
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
  useEffect(() => {
    tempRef.current = temp;
  }, [temp]);
  const [ride, setRide] = useState<IARide>({
    screen: "",
    data: { waiting: {} },
  });
  const rideWaitingRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    rideWaitingRef.current =
      (ride?.data?.waiting as unknown as Record<string, unknown>) || {};
  }, [ride?.data?.waiting]);
  const tripCompletedRef = useRef(false);
  const rideScreenRef = useRef<string>("");
  useEffect(() => {
    tripCompletedRef.current = tripCompleted;
  }, [tripCompleted]);
  useEffect(() => {
    rideScreenRef.current = ride.screen;
  }, [ride.screen]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; long: number; eta: number | null; distance: number | null } | null>(null);
  /** When true, open Book Ride sheet as soon as ref is available (handles ref timing) */
  const [pendingOpenBookRide, setPendingOpenBookRide] = useState(false);
  const [initialDropoff, setInitialDropoff] = useState<{
    name: string;
    lat: number | null;
    lng: number | null;
  } | null>(null);

  const [maps, setMaps] = useState({
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
  });

  const hasPickupAndDest =
    maps.origin.latitude !== 0 &&
    maps.origin.longitude !== 0 &&
    maps.destination.latitude !== 0 &&
    maps.destination.longitude !== 0 &&
    maps.destination.latitude !== 1 &&
    maps.destination.longitude !== 1;
  const { routeCoords, eta, distance, loading: routeLoading, durationSeconds: routeDurationSecondsFromHook } = useRoute(
    hasPickupAndDest ? maps.origin : undefined,
    hasPickupAndDest ? maps.destination : undefined,
    { enabled: hasPickupAndDest }
  );

  useEffect(() => {
    // Clear first: stale duration can remain for one frame after maps reset (useRoute clears result in useEffect).
    if (!hasPickupAndDest) {
      setRouteDurationSeconds(null);
      setRouteArriveBy(null);
      return;
    }
    if (routeDurationSecondsFromHook > 0) {
      setRouteDurationSeconds(routeDurationSecondsFromHook);
      const arrive = new Date(Date.now() + routeDurationSecondsFromHook * 1000);
      setRouteArriveBy(arrive.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
  }, [routeDurationSecondsFromHook, hasPickupAndDest]);

  const [routeKey, setRouteKey] = useState(0);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);
  const [routeArriveBy, setRouteArriveBy] = useState<string | null>(null);
  const prevIsBookingRef = useRef(isBooking);

  // When booking sheet is closed and there's no active ride, clear the route line
  useEffect(() => {
    const hadBooking = prevIsBookingRef.current;
    prevIsBookingRef.current = isBooking;
    if (hadBooking && !isBooking) {
      const waiting = (reduxRide?.data as any)?.waiting || ride?.data?.waiting;
      const hasActiveRide = temp?.ride_id || (waiting as any)?._id || (waiting as any)?.ride_id;
      if (
        !hasActiveRide &&
        maps.destination.latitude !== 0 &&
        maps.destination.longitude !== 0 &&
        maps.destination.latitude !== 1 &&
        maps.destination.longitude !== 1
      ) {
        setMaps((prev) => ({
          ...prev,
          destination: { latitude: 0, longitude: 0 },
        }));
        setRouteDurationSeconds(null);
        setRouteArriveBy(null);
        setRouteKey((k) => k + 1);
        dispatch(
          setRideData({
            waiting: {},
            destination: { name: "", lat: "", long: "" },
          } as any)
        );
      }
    }
  }, [isBooking]);

  // Use location if we have valid coordinates (be more lenient with accuracy)
  const hasValidLocation = location.latitude !== 0 && 
                          location.longitude !== 0 && 
                          !isNaN(location.latitude) && 
                          !isNaN(location.longitude);
  
  // Default region (Nigeria) - only used as fallback if GPS never becomes available
  const DEFAULT_REGION = {
    latitude: 9.082,
    longitude: 8.6753,
    ...mapDelta,
  };

  // Clear ride state function - resets all ride-related state cleanly
  // This function must be defined before getActiveRide and other functions that use it
  const clearRideState = useCallback(() => {
    invalidateWalletCache();
    logger.info('🧹 Clearing ride state completely');
    lastActiveRideUiKeyRef.current = "";
    pendingConfirmHydrationRef.current = false;
    if (pendingConfirmHydrationTimerRef.current) {
      clearTimeout(pendingConfirmHydrationTimerRef.current);
      pendingConfirmHydrationTimerRef.current = null;
    }
    // Ensure Redux ride slice is cleared (prevents any persisted/stale rideId from driving UI).
    dispatch(clearRideStateAction());

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
    
    // Clear route ETA
    setRouteDurationSeconds(null);
    setRouteArriveBy(null);
    
    // Increment route key to force MapDirections refresh
    setRouteKey(prev => prev + 1);
    
    // Reset Redux state so the map route doesn't reappear from stored ride data
    dispatch(
      setAppData({
        isBooking: false,
      })
    );
    dispatch(setRideData({ waiting: {}, origin: {}, destination: {} } as any));
    dispatch(setRideUtils({ driverLiveLocation: null }));
    dispatch(setSubscriptionUtils({ chat: false }));
    
    // Animate map to default home region (user location or default). Use ref so async callbacks get latest location.
    if (mapRef.current) {
      const lat = locationRef.current.latitude;
      const lng = locationRef.current.longitude;
      const currentHasValidLocation = lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);
      const defaultRegion = currentHasValidLocation ? {
        latitude: lat,
        longitude: lng,
        ...mapDelta,
      } : DEFAULT_REGION;
      
      mapRef.current.animateToRegion(defaultRegion, 800);
      logger.debug('✅ Map animated to default home region', defaultRegion);
    }
  }, [location.latitude, location.longitude, dispatch]);

  const openPostRideSummary = useCallback(
    (snapshot: Partial<TRide> & Record<string, unknown>) => {
      const applyFareFields = (
        record: TRide & Record<string, unknown>
      ): TRide & Record<string, unknown> => {
        const rawCost =
          record.cost ??
          (record.fare as { totalFare?: number } | undefined)?.totalFare ??
          (record.fare_breakdown as { ride_fare?: number } | undefined)?.ride_fare ??
          (record.fare_breakdown as { total_paid?: number } | undefined)?.total_paid;
        if (rawCost != null && rawCost !== "") {
          record.cost = String(
            typeof rawCost === "number" ? Math.round(rawCost) : rawCost
          );
        }
        const fb = record.fare_breakdown as
          | { ride_fare?: number; service_charge?: number; total_paid?: number }
          | undefined;
        if (fb && typeof fb === "object") {
          record.fare_breakdown = fb;
          record.fareBreakdown = {
            baseFare: Number(fb.ride_fare) || 0,
            serviceCharge: Number(fb.service_charge) || 0,
            total: Number(fb.total_paid) || 0,
          };
        }
        return record;
      };

      const presentSummary = (record: TRide & Record<string, unknown>) => {
        const merged = applyFareFields(record);
        setTemp(merged as TRide);
        setRide({
          screen: "SUMMARY",
          data: { waiting: merged as unknown as IARide["data"]["waiting"] },
        });
        dispatch(
          setAppData({
            isBooking: true,
          })
        );
        setMaps({
          origin: { latitude: 0, longitude: 0 },
          destination: { latitude: 0, longitude: 0 },
        });
        setRouteKey((k) => k + 1);
        tripCompletedRef.current = false;
        setTripCompleted(false);

        // Open the ride sheet directly on SUMMARY (do not gate behind TripCompletedModal).
        setTimeout(() => {
          try {
            activeRideSheetRef?.current?.open();
          } catch {
            // ignore
          }
        }, 250);

        if (mapRef.current) {
          const lat = locationRef.current.latitude;
          const lng = locationRef.current.longitude;
          const currentHasValidLocation =
            lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);
          const defaultRegion = currentHasValidLocation
            ? { latitude: lat, longitude: lng, ...mapDelta }
            : { latitude: 9.082, longitude: 8.6753, ...mapDelta };
          mapRef.current.animateToRegion(defaultRegion, 800);
        }
      };

      const base = {
        ...tempRef.current,
        ...snapshot,
        status: "completed",
      } as TRide & Record<string, unknown>;
      const rideId = String(base.ride_id ?? base._id ?? "").trim();
      const hasFare = (() => {
        const preview = applyFareFields({ ...base });
        return !!preview.cost && preview.cost !== "0";
      })();

      if (hasFare || !rideId) {
        presentSummary(base);
        return;
      }

      (async () => {
        let enriched: TRide & Record<string, unknown> = base;
        try {
          const { data } = await apiClient.get(`rides/${rideId}`);
          const detail =
            data?.data?.ride ?? data?.ride ?? data?.data ?? null;
          if (detail && typeof detail === "object") {
            enriched = {
              ...base,
              ...(detail as Record<string, unknown>),
              ride_id: rideId,
              status: "completed",
            };
          }
        } catch {
          try {
            const { data } = await apiClient.get("booking/active-ride");
            const rideData = data?.data?.ride || data?.ride || null;
            if (rideData && typeof rideData === "object" && Object.keys(rideData).length > 0) {
              enriched = {
                ...base,
                ...(rideData as Record<string, unknown>),
                ride_id: rideId,
                status: "completed",
              };
            }
          } catch {
            // keep snapshot as-is
          }
        }
        presentSummary(enriched);
      })();
    },
    [dispatch]
  );

  useEffect(() => {
    if (!pendingOpenChatRideId) return;
    const rid =
      temp?.ride_id ||
      (temp as { _id?: string })?._id ||
      (ride?.data?.waiting as { ride_id?: string })?.ride_id;
    if (!rid || String(rid) !== String(pendingOpenChatRideId)) return;
    setChatOpenKick((k) => k + 1);
    dispatch(setAppData({ pendingOpenChatRideId: null }));
  }, [pendingOpenChatRideId, temp?.ride_id, ride?.data?.waiting, dispatch]);

  const riderActiveRideStatusForMap = String(
    temp?.status ?? (ride?.data?.waiting as any)?.status ?? ""
  );

  useEffect(() => {
    const st = String(
      temp?.status ?? (ride?.data?.waiting as any)?.status ?? ""
    ).toLowerCase();
    if (
      st === "in-progress" ||
      st === "in_progress" ||
      st === "started" ||
      st === "completed" ||
      st === "cancelled" ||
      st === "rejected"
    ) {
      dispatch(setRideUtils({ driverLiveLocation: null }));
    }
  }, [temp?.status, ride?.data?.waiting, dispatch]);

  // Milestone offer countdown: show one toast per session when rider is close or can claim.
  // Re-uses a 5-minute cached response so repeated home focuses don't re-hit the endpoint.
  useEffect(() => {
    if (!isFocused || !token) return;
    if (milestoneToastShownRef.current) return;
    requestManager
      .execute(
        "milestone-offers",
        () => apiClient.get("special/offers/milestone"),
        5 * 60 * 1000
      )
      .then(({ data: res }) => {
        const d = res?.data;
        if (!d?.available || d?.claimed) return;
        if (d?.can_claim) {
          milestoneToastShownRef.current = true;
          safeShowMessage({
            type: "success",
            message: "You've unlocked ₦1,000! Tap Offers to claim your free ride credit.",
            duration: 5000,
          });
        } else if (d?.rides_remaining >= 1 && d?.rides_remaining <= 3) {
          milestoneToastShownRef.current = true;
          const msg =
            d.rides_remaining === 1
              ? "1 more ride to unlock your free ₦1,000!"
              : `${d.rides_remaining} more rides to unlock your free ₦1,000!`;
          safeShowMessage({
            type: "info",
            message: `🎁 ${msg}`,
            duration: 4500,
          });
        }
      })
      .catch((err) => {
        if (__DEV__) {
          const msg = err?.response?.data?.message ?? err?.message;
          if (msg) safeShowMessage({ type: "info", message: String(msg), duration: 3000 });
        }
      });
  }, [isFocused, token]);

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

      mapRef.current?.animateToRegion({
        latitude: (origin.latitude + destination.latitude) / 2,
        longitude: (origin.longitude + destination.longitude) / 2,
        latitudeDelta: Math.max(Math.abs(origin.latitude - destination.latitude) * 2.5, 0.015),
        longitudeDelta: Math.max(Math.abs(origin.longitude - destination.longitude) * 2.5, 0.015),
      }, 600);

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

  const openFindRideSheet = useCallback((rebookDropoff?: {
    dropoff_name: string;
    dropoff_lat?: number | null;
    dropoff_lng?: number | null;
  }) => {
    dispatch(setAppData({ isBooking: true }));
    dispatch(
      setRideData({
        waiting: {} as any,
        origin: { name: "", lat: "", long: "" },
        destination: { name: "", lat: "", long: "" },
        vehicle_type_id: "",
        driver_id: "",
        payment_type: "",
        promo_code: "",
      })
    );
    dispatch(setRideUtils({ drivers: [] }));

    if (rebookDropoff?.dropoff_name) {
      setInitialDropoff({
        name: rebookDropoff.dropoff_name,
        lat: rebookDropoff.dropoff_lat ?? null,
        lng: rebookDropoff.dropoff_lng ?? null,
      });
    } else {
      setInitialDropoff(null);
    }

    setTimeout(() => {
      rideSheetRef?.current?.open();
    }, 100);
  }, [dispatch]);


  const getActiveBooking = () => {
    // Load dismissed booking ID from storage
    AsyncStorage.getItem('dismissedBookingId').then((storedDismissedId) => {
      if (storedDismissedId) {
        setDismissedBookingId(storedDismissedId);
      }
    });
    
    apiClient
      .get("schedule/latest/booking")
      .then(async ({ data }) => {
        const bookings = data?.data || [];
        const suppressedIds = await readSuppressedScheduleBookingIds();
        if (Array.isArray(bookings) && bookings.length > 0) {
          const bookingData = bookings.find((candidate: any) => {
            const bid = String(
              candidate?.ride_id ??
                candidate?._id ??
                candidate?.booking_id ??
                ""
            ).trim();
            if (bid && suppressedIds.has(bid)) return false;

            const statusNorm = normalizeBookingListStatus(
              candidate?.status ??
                candidate?.ride_status ??
                candidate?.internal_status ??
                candidate?.booking_status
            );
            return !isTerminalScheduleListStatus(statusNorm);
          });

          if (!bookingData) {
            const hasOnlyClosedBookings = bookings.every((candidate: any) => {
              const bid = String(
                candidate?.ride_id ??
                  candidate?._id ??
                  candidate?.booking_id ??
                  ""
              ).trim();
              if (bid && suppressedIds.has(bid)) return true;
              const statusNorm = normalizeBookingListStatus(
                candidate?.status ??
                  candidate?.ride_status ??
                  candidate?.internal_status ??
                  candidate?.booking_status
              );
              return isTerminalScheduleListStatus(statusNorm);
            });

            if (hasOnlyClosedBookings) {
              await AsyncStorage.removeItem('dismissedBookingId');
              setDismissedBookingId(null);
            }

            logger.debug('No displayable booking found for home preview');
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
                logger.debug('Error parsing scheduled_at for time', { error: e instanceof Error ? e.message : String(e) });
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
            payment_method:
              bookingData.payment_method ||
              (bookingData as any).paymentMethod ||
              bookingData.payment_type ||
              'wallet',
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
    refreshActiveBookingOnFocus(() => {
      if (!token) return;
      // Load dismissed booking ID on focus
      AsyncStorage.getItem("dismissedBookingId").then((dismissedId) => {
        if (dismissedId) {
          setDismissedBookingId(dismissedId);
        }
      });
      getActiveBooking();
    });
  }, [isFocused, token, refreshActiveBookingOnFocus]);

  // When user requests to open Book Ride sheet (tap or from Rides tab), set pending so effect can open it
  useEffect(() => {
    if ((params?.openBookRide === "true" || requestOpenBookRide) && isFocused) {
      setPendingOpenBookRide(true);
      if (requestOpenBookRide) dispatch(setAppData({ requestOpenBookRide: false }));
    }
  }, [params?.openBookRide, requestOpenBookRide, isFocused, dispatch]);

  // Open Book Ride sheet when pending and ref is available (handles ref not ready on first paint)
  useEffect(() => {
    if (!pendingOpenBookRide || !isFocused) return;

    const tryOpen = () => {
      if (bookRideSheetRef?.current?.open) {
        setBookRideOpenVersion((value) => value + 1);
        bookRideSheetRef.current.open();
        router.setParams({ openBookRide: undefined });
        setPendingOpenBookRide(false);
        return true;
      }
      return false;
    };

    if (tryOpen()) return;

    const t1 = setTimeout(() => { if (tryOpen()) return; }, 100);
    const t2 = setTimeout(() => { if (tryOpen()) return; }, 350);
    const t3 = setTimeout(() => { if (tryOpen()) return; }, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pendingOpenBookRide, isFocused]);

  // Check if we should open find ride sheet from route params (for rebook)
  useEffect(() => {
    if (params?.openFindRide === "true" && isFocused && rideSheetRef?.current) {
      // Small delay to ensure the screen is fully loaded
      const timer = setTimeout(() => {
        openFindRideSheet();
        router.setParams({ openFindRide: undefined });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [params?.openFindRide, isFocused, openFindRideSheet]);

  useEffect(() => {
    const dropoffName = typeof params?.rebook_dropoff_name === "string" ? params.rebook_dropoff_name.trim() : "";
    const latRaw = typeof params?.rebook_dropoff_lat === "string" ? params.rebook_dropoff_lat.trim() : "";
    const lngRaw = typeof params?.rebook_dropoff_lng === "string" ? params.rebook_dropoff_lng.trim() : "";
    const parsedLat = latRaw ? parseFloat(latRaw) : null;
    const parsedLng = lngRaw ? parseFloat(lngRaw) : null;
    const hasCoords =
      parsedLat != null &&
      parsedLng != null &&
      !Number.isNaN(parsedLat) &&
      !Number.isNaN(parsedLng) &&
      parsedLat !== 0 &&
      parsedLng !== 0;

    if (!isFocused || !dropoffName) return;

    const timer = setTimeout(() => {
      openFindRideSheet({
        dropoff_name: dropoffName,
        dropoff_lat: hasCoords ? parsedLat : null,
        dropoff_lng: hasCoords ? parsedLng : null,
      });

      router.setParams({
        rebook_dropoff_name: undefined,
        rebook_dropoff_lat: undefined,
        rebook_dropoff_lng: undefined,
      });

      setTimeout(() => {
        setInitialDropoff(null);
      }, 1200);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    params?.rebook_dropoff_name,
    params?.rebook_dropoff_lat,
    params?.rebook_dropoff_lng,
    isFocused,
    openFindRideSheet,
  ]);

  /** Apply `ride.status` payloads immediately — GET /booking/active-ride often lags Pusher. */
  const applyPusherRideStatusPatchFn = useCallback(
    (patch: Record<string, unknown> | null) => {
      if (!patch) return;
      const incomingId = String(patch.ride_id ?? patch.rideId ?? "").trim();
      const localId = String(
        tempRef.current?.ride_id ??
          rideWaitingRef.current?.ride_id ??
          rideWaitingRef.current?._id ??
          ""
      ).trim();
      if (!incomingId || incomingId !== localId) return;

      setTemp((prev) => {
        const next = mergePusherRideStatusPatch(
          prev as unknown as Record<string, unknown>,
          patch
        ) as TRide;
        tempRef.current = next;
        return next;
      });
      setRide((prev) => {
        const waiting = mergePusherRideStatusPatch(
          ((prev.data?.waiting ?? {}) as unknown as Record<string, unknown>) ||
            {},
          patch
        );
        rideWaitingRef.current = waiting;
        const screen =
          prev.screen === "" || prev.screen === "WAITING"
            ? "WAITING"
            : prev.screen;
        return {
          ...prev,
          screen,
          data: {
            ...prev.data,
            waiting: waiting as unknown as IARide["data"]["waiting"],
          },
        };
      });
      logger.debug("Applied ride.status Pusher patch", {
        rideId: incomingId,
        internal_status: patch.internal_status,
      });
    },
    []
  );

  const applyRideAcceptedPatchFn = useCallback(
    (rideId: string, extra: Record<string, unknown> = {}) => {
      const id = String(rideId || "").trim();
      if (!id) return;
      applyPusherRideStatusPatchFn(buildRideAcceptedStatusPatch(id, extra));
    },
    [applyPusherRideStatusPatchFn]
  );

  const handleRideCancelled = useCallback(
    (payload?: Record<string, unknown> | null) => {
      const st = String(
        payload?.internal_status ?? payload?.status ?? ""
      ).toLowerCase();
      const rematching = st === "searching" || st === "requested";
      const actor = resolveRideCancelledActor(payload);

      if (!(actor === "rider" && shouldSuppressRiderCancelToast())) {
        const toast = getRiderAppCancelToastMessage(
          actor,
          rematching,
          payload?.reason
        );
        safeShowMessage({ type: toast.type, message: toast.message });
      }

      if (rematching && actor === "driver") {
        const rideId = String(
          payload?.ride_id ?? payload?.rideId ?? tempRef.current?.ride_id ?? ""
        ).trim();
        if (rideId) {
          applyPusherRideStatusPatchFn(buildRideRematchingStatusPatch(rideId));
        }
        getActiveRide();
        return;
      }

      if (actor === "rider" || actor === "system" || !rematching) {
        clearRideState();
        activeRideSheetRef?.current?.close();
        dispatch(setAppData({ isBooking: false }));
      }
      getActiveRide();
    },
    [applyPusherRideStatusPatchFn, clearRideState, dispatch]
  );

  const getActiveRide = () => {
    if (getActiveRideInFlightRef.current) {
      logger.debug("getActiveRide coalesced — request already in flight");
      pendingGetActiveRideRef.current = true;
      return;
    }
    const now = Date.now();
    if (now - getActiveRideLastStartRef.current < GET_ACTIVE_RIDE_MIN_MS) {
      logger.debug("getActiveRide coalesced — fired within min-interval window");
      pendingGetActiveRideRef.current = true;
      return;
    }
    getActiveRideInFlightRef.current = true;
    getActiveRideLastStartRef.current = now;

    setLoading(true);
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 10000); // 10 second timeout

    apiClient
      .get("booking/active-ride")
      .then(({ data }) => {
        clearTimeout(timeoutId);
        // Try multiple response structures.
        // Intentionally NOT falling back to data?.data — that would pick up the
        // wrapper object { ride: null } when the backend returns no active ride,
        // making it look like a ride exists but with no ride_id.
        const rideData = data?.data?.ride || data?.ride || {};
        const rideRecord = rideData as Record<string, unknown>;
        const rideIdFromPayload = getActiveRideId(rideRecord);
        const hasRidePayload = Object.keys(rideData).length > 0;

        // Backend audit: `GET .../booking/active-ride` should return 404 or null/empty ride when
        // the rider has no active trip. Returning finished rides under non-terminal statuses causes
        // stale UI — verify server-side active-ride selection if ghosts persist after client guards.

        const clearActiveRideUiIfAllowed = () => {
          logger.debug("No active ride found or invalid data");
          if (justBookedRef.current) {
            logger.debug(
              "Grace period active: skipping clear, retrying active-ride in 3 s"
            );
            setTimeout(getActiveRide, 3_000);
            return;
          }
          if (
            rideScreenRef.current === "SUMMARY" ||
            rideScreenRef.current === "REVIEW"
          ) {
            logger.debug(
              "No active ride but post-ride sheet flow is open, skipping clear"
            );
            return;
          }
          if (tripCompletedRef.current) {
            logger.debug("Trip completed modal is showing, skipping clear");
            return;
          }
          const reduxW = (reduxRide?.data as any)?.waiting;
          const localW = ride?.data?.waiting as any;
          const hasTrackedActiveRide =
            !!temp?.ride_id ||
            !!localW?.ride_id ||
            !!localW?._id ||
            !!reduxW?.ride_id ||
            !!reduxW?._id;
          const bookingDraftOnly =
            isBooking &&
            ride.screen !== "WAITING" &&
            !hasTrackedActiveRide;
          if (bookingDraftOnly) {
            logger.debug(
              "Book ride flow open with no active trip — skipping clearRideState (empty active-ride is expected)"
            );
            return;
          }
          if (
            pendingConfirmHydrationRef.current &&
            ride.screen === "WAITING" &&
            hasTrackedActiveRide
          ) {
            logger.debug(
              "Confirm-ride hydrated UI but active-ride still empty — retrying active-ride"
            );
            setTimeout(getActiveRide, 3_000);
            return;
          }
          clearRideState();
          activeRideSheetRef?.current?.close();
        };

        if (!hasRidePayload) {
          clearActiveRideUiIfAllowed();
        } else if (!rideIdFromPayload) {
          logger.debug(
            "Active ride payload missing ride_id/_id, clearing ride state"
          );
          clearActiveRideUiIfAllowed();
        } else if (isActiveRidePayloadStale(rideRecord)) {
          logger.debug("Active ride payload stale (>2h), clearing ride state", {
            rideId: rideIdFromPayload,
          });
          clearRideState();
          activeRideSheetRef?.current?.close();
        } else {
          const rideStatus = getRideStatusLower(rideRecord);

          if (isTerminalRideStatus(rideStatus)) {
            if (
              (rideStatus === "completed" || rideStatus === "done") &&
              rideIdFromPayload
            ) {
              openPostRideSummary({
                ...(rideData as object),
                ride_id: rideData?.ride_id || rideData?._id,
                cost:
                  rideData?.cost ??
                  (rideData as { fare?: { totalFare?: number } })?.fare?.totalFare,
              } as Partial<TRide> & Record<string, unknown>);
              return;
            }
            logger.debug("Ride is terminal, clearing ride state", {
              status: rideStatus,
            });
            clearRideState();
            activeRideSheetRef?.current?.close();
            return;
          }

          if (!isRestorableRideStatus(rideStatus)) {
            logger.debug(
              "Active ride status not restorable on launch, clearing ride state",
              {
                status: rideStatus,
              }
            );
            clearRideState();
            activeRideSheetRef?.current?.close();
            return;
          }

          const rideId = rideData?.ride_id || rideData?._id;
          // Key must reflect reconciled UI truth (Pusher may advance acceptance before GET catches up).
          const reconciledPreview = reconcileStaleActiveRideGet(
            tempRef.current as unknown as Record<string, unknown>,
            rideRecord
          );
          const previewStatus = getRideStatusLower(reconciledPreview);
          const rideUiKey = `${rideId}|${previewStatus}|${String(reconciledPreview.accepted_by_driver)}|${String(reconciledPreview.driver_id ?? "")}|${String(reconciledPreview.is_ride_started)}|${String(reconciledPreview.drop_off_completed)}|${String(reconciledPreview.payment_status ?? "")}|${String(reconciledPreview.internal_status ?? "")}`;
          const uiChanged = lastActiveRideUiKeyRef.current !== rideUiKey;
          lastActiveRideUiKeyRef.current = rideUiKey;

          if (uiChanged) {
            logger.debug("Active ride API response", { data });
            logger.debug("Extracted ride data", {
              rideData,
              keys: Object.keys(rideData),
              hasRideId: !!rideData?.ride_id,
            });
            logger.info("Found active ride", { rideId });
          } else if (__DEV__) {
            logger.debug("Active ride unchanged (skipping sheet re-open / map refit)", { rideId });
          }

          // Ride confirmed — cancel any grace-period timer and clear the flag.
          justBookedRef.current = false;
          if (justBookedTimerRef.current) {
            clearTimeout(justBookedTimerRef.current);
            justBookedTimerRef.current = null;
          }
          pendingConfirmHydrationRef.current = false;
          if (pendingConfirmHydrationTimerRef.current) {
            clearTimeout(pendingConfirmHydrationTimerRef.current);
            pendingConfirmHydrationTimerRef.current = null;
          }

          let reconciledSnapshot: TRide | null = null;
          setTemp((prev) => {
            reconciledSnapshot = reconcileStaleActiveRideGet(
              prev as unknown as Record<string, unknown>,
              rideRecord
            ) as TRide;
            tempRef.current = reconciledSnapshot;
            return reconciledSnapshot;
          });
          if (reconciledSnapshot) {
            setRide({
              screen: "WAITING",
              data: {
                waiting:
                  reconciledSnapshot as unknown as IARide["data"]["waiting"],
              },
            });
          }
          dispatch(
            setAppData({
              isBooking: true,
            })
          );

          if (uiChanged) {
            animateToMapDirections(reconciledSnapshot ?? (rideData as TRide));
            // Only open/re-open the sheet if user isn't actively on the
            // driver search or other sub-screens — prevents modal re-popping
            // when user taps "Try another driver" and polling fires.
            const currentScreen = rideScreenRef.current;
            const suppressReopen =
              currentScreen === "SEARCH" ||
              currentScreen === "DRIVERS" ||
              currentScreen === "SUMMARY" ||
              currentScreen === "REVIEW";
            if (!suppressReopen) {
              setTimeout(() => {
                logger.debug("Opening active ride sheet");
                activeRideSheetRef?.current?.open();
              }, 300);
            }
            setTrigger(Math.random());
          }
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          // Token refresh is handled by the API client interceptor automatically.
          // Do NOT clear ride state here — the interceptor will retry the request
          // with a new token and getActiveRide will be called again via the retry.
          logger.debug('Authentication error (401) - token refresh in progress, skipping clear');
          return;
        }
        
        // Silently handle 404 errors (no active ride, etc.)
        if (status === 404) {
          logger.debug("No active ride found (404) - silently handling");
          if (ride?.screen === "SUMMARY" || ride?.screen === "REVIEW") {
            return;
          }
          const reduxW404 = (reduxRide?.data as any)?.waiting;
          const localW404 = ride?.data?.waiting as any;
          const hasTracked404 =
            !!temp?.ride_id ||
            !!localW404?.ride_id ||
            !!localW404?._id ||
            !!reduxW404?.ride_id ||
            !!reduxW404?._id;
          if (
            isBooking &&
            ride.screen !== "WAITING" &&
            !hasTracked404
          ) {
            logger.debug(
              "404 active-ride during book draft — skipping clearRideState"
            );
            return;
          }
          if (
            pendingConfirmHydrationRef.current &&
            ride.screen === "WAITING" &&
            hasTracked404
          ) {
            logger.debug(
              "404 active-ride while confirm hydration pending — retrying active-ride"
            );
            setTimeout(getActiveRide, 3_000);
            return;
          }
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
        getActiveRideInFlightRef.current = false;
        const rerun = pendingGetActiveRideRef.current;
        pendingGetActiveRideRef.current = false;
        if (rerun) {
          setTimeout(() => getActiveRide(), 0);
        }
      });
  };

  useEffect(() => {
    refreshLocationsOnFocus(() => {
      getLocations();
    });
  }, [isFocused, token, refreshLocationsOnFocus]);

  useEffect(() => {
    refreshActiveRideOnFocus(() => {
      if (!token) return;
      getActiveRide();
    });
  }, [isFocused, token, refreshActiveRideOnFocus]);

  // Update maps state when ride data changes (from find-ride flow or Redux store)
  useEffect(() => {
    // Prefer waiting (active ride), then top-level origin/destination (selected in Find Ride / Book a Ride)
    const waitingData = ride?.data?.waiting || (reduxRide?.data as any)?.waiting;
    const rideStatusRaw = waitingData?.status ?? temp?.status;
    const rideStatus =
      typeof rideStatusRaw === "string"
        ? rideStatusRaw.toLowerCase()
        : String(rideStatusRaw ?? "").toLowerCase();

    if (rideStatus === "completed") {
      if (ride?.screen === "SUMMARY" || ride?.screen === "REVIEW") {
        return;
      }
      const src =
        waitingData && Object.keys(waitingData).length > 0 ? waitingData : temp;
      const sid = (src as { ride_id?: string; _id?: string })?.ride_id ||
        (src as { _id?: string })?._id;
      if (sid) {
        logger.debug("Home: Showing post-ride summary", { status: rideStatus });
        openPostRideSummary({
          ...(src as object),
          ride_id: sid,
        } as Partial<TRide> & Record<string, unknown>);
        return;
      }
    }

    // Clear map if ride is cancelled or rejected
    if (rideStatus === "cancelled" || rideStatus === "rejected") {
      logger.debug("Home: Clearing ride state - ride ended", { status: rideStatus });
      clearRideState();
      activeRideSheetRef?.current?.close();
      return;
    }

    const data = reduxRide?.data ?? ride?.data;
    const draft = data as any;

    const draftOLat = parseFloat(String(draft?.origin?.lat ?? draft?.origin?.latitude ?? "0"));
    const draftOLng = parseFloat(String(draft?.origin?.long ?? draft?.origin?.longitude ?? "0"));
    const draftDLat = parseFloat(String(draft?.destination?.lat ?? draft?.destination?.latitude ?? "0"));
    const draftDLng = parseFloat(String(draft?.destination?.long ?? draft?.destination?.longitude ?? "0"));
    const draftHasBothPins =
      Number.isFinite(draftOLat) &&
      Number.isFinite(draftOLng) &&
      Number.isFinite(draftDLat) &&
      Number.isFinite(draftDLng) &&
      draftOLat !== 0 &&
      draftOLng !== 0 &&
      draftDLat !== 0 &&
      draftDLng !== 0;

    const w = waitingData as any;
    const wStatus = String(w?.status ?? "").toLowerCase();
    const terminalWaiting = ["completed", "cancelled", "canceled", "rejected", "failed", "expired"];
    const waitingHasId = !!(w?.ride_id ?? w?._id);
    const waitingIsLive =
      w &&
      typeof w === "object" &&
      Object.keys(w).length > 0 &&
      waitingHasId &&
      wStatus.length > 0 &&
      !terminalWaiting.includes(wStatus);

    const hasLiveTrip = !!temp?.ride_id || waitingIsLive;

    let originSource: any;
    let destSource: any;
    if (hasLiveTrip) {
      originSource = waitingData?.origin ?? draft?.origin;
      destSource = waitingData?.destination ?? draft?.destination;
    } else if (draftHasBothPins) {
      originSource = draft?.origin;
      destSource = draft?.destination;
    } else {
      originSource = waitingData?.origin ?? draft?.origin;
      destSource = waitingData?.destination ?? draft?.destination;
    }

    const originLatRaw = originSource?.lat ?? originSource?.latitude;
    const originLongRaw = originSource?.long ?? originSource?.longitude;
    const destLatRaw = destSource?.lat ?? destSource?.latitude;
    const destLongRaw = destSource?.long ?? destSource?.longitude;

    const hasValidOrigin =
      originLatRaw != null && originLongRaw != null &&
      parseFloat(String(originLatRaw)) !== 0 &&
      parseFloat(String(originLongRaw)) !== 0 &&
      !Number.isNaN(parseFloat(String(originLatRaw))) &&
      !Number.isNaN(parseFloat(String(originLongRaw)));

    const hasValidDestination =
      destLatRaw != null && destLongRaw != null &&
      String(destLatRaw).trim() !== '' && String(destLongRaw).trim() !== '' &&
      parseFloat(String(destLatRaw)) !== 0 &&
      parseFloat(String(destLongRaw)) !== 0 &&
      !Number.isNaN(parseFloat(String(destLatRaw))) &&
      !Number.isNaN(parseFloat(String(destLongRaw)));

    if (!hasValidOrigin) return;

    const originLat = parseFloat(String(originLatRaw));
    const originLong = parseFloat(String(originLongRaw));
    const destLat = hasValidDestination ? parseFloat(String(destLatRaw)) : 0;
    const destLong = hasValidDestination ? parseFloat(String(destLongRaw)) : 0;

    const newOrigin = { latitude: originLat, longitude: originLong };
    const newDest = hasValidDestination ? { latitude: destLat, longitude: destLong } : { latitude: 0, longitude: 0 };

    if (
      maps.origin.latitude !== originLat ||
      maps.origin.longitude !== originLong ||
      maps.destination.latitude !== destLat ||
      maps.destination.longitude !== destLong
    ) {
      setMaps({ origin: newOrigin, destination: newDest });

      if (mapRef.current && hasValidDestination) {
        const noWorldView = Math.abs(destLat) >= 0.01 && Math.abs(destLong) >= 0.01;
        if (noWorldView) {
          const distanceKm = haversineKm(newOrigin, newDest);
          if (distanceKm <= MAX_FIT_DISTANCE_KM) {
            mapRef.current?.animateToRegion({
              latitude: (newOrigin.latitude + newDest.latitude) / 2,
              longitude: (newOrigin.longitude + newDest.longitude) / 2,
              latitudeDelta: Math.max(Math.abs(newOrigin.latitude - newDest.latitude) * 2.5, 0.015),
              longitudeDelta: Math.max(Math.abs(newOrigin.longitude - newDest.longitude) * 2.5, 0.015),
            }, 600);
          } else {
            (mapRef.current as any).animateToRegion?.({
              latitude: newOrigin.latitude,
              longitude: newOrigin.longitude,
              ...mapDelta,
            }, 400);
          }
        }
      }
      logger.debug("Home: Updated maps from ride data", { origin: newOrigin, destination: newDest, hasValidDestination });
    }
  }, [
    (reduxRide?.data as any)?.waiting?.origin?.lat,
    (reduxRide?.data as any)?.waiting?.origin?.long,
    (reduxRide?.data as any)?.waiting?.origin?.latitude,
    (reduxRide?.data as any)?.waiting?.origin?.longitude,
    (reduxRide?.data as any)?.waiting?.destination?.lat,
    (reduxRide?.data as any)?.waiting?.destination?.long,
    (reduxRide?.data as any)?.waiting?.destination?.latitude,
    (reduxRide?.data as any)?.waiting?.destination?.longitude,
    (reduxRide?.data as any)?.waiting?.status,
    (reduxRide?.data as any)?.origin?.lat,
    (reduxRide?.data as any)?.origin?.long,
    (reduxRide?.data as any)?.origin?.latitude,
    (reduxRide?.data as any)?.origin?.longitude,
    (reduxRide?.data as any)?.destination?.lat,
    (reduxRide?.data as any)?.destination?.long,
    (reduxRide?.data as any)?.destination?.latitude,
    (reduxRide?.data as any)?.destination?.longitude,
    ride?.data?.waiting?.origin?.lat,
    ride?.data?.waiting?.origin?.long,
    ride?.data?.waiting?.destination?.lat,
    ride?.data?.waiting?.destination?.long,
    ride?.data?.waiting?.status,
    (ride?.data as any)?.origin?.lat,
    (ride?.data as any)?.origin?.long,
    (ride?.data as any)?.origin?.latitude,
    (ride?.data as any)?.origin?.longitude,
    (ride?.data as any)?.destination?.lat,
    (ride?.data as any)?.destination?.long,
    (ride?.data as any)?.destination?.latitude,
    (ride?.data as any)?.destination?.longitude,
    ride?.screen,
    temp?.status,
    temp?.ride_id,
    openPostRideSummary,
    clearRideState,
  ]);

  useEffect(() => {
    const name = address?.formattedAddress;
    const isValid = typeof name === 'string' && name.trim() && name.trim().toLowerCase() !== 'location';
    if (isValid && location.latitude !== 0) {
      dispatch(
        setRideUtils({
          user_location: {
            lat: location.latitude?.toString(),
            long: location.longitude?.toString(),
            name: name.trim(),
          },
        })
      );
    }
  }, [address?.formattedAddress, location.latitude, location.longitude, dispatch]);

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
    refreshCurrentUserOnFocus(() => {
      getCurrentUser();
    });
  }, [isFocused, refreshCurrentUserOnFocus]);
  
  // When booking sheet is open and no pickup/destination set yet, show local region (never world view)
  const ABAKALIKI_REGION = {
    latitude: 6.3249,
    longitude: 8.1137,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  useEffect(() => {
    if (!isBooking || !mapRef.current) return;
    if (hasPickupAndDest) return;
    if (maps.origin.latitude !== 0 || maps.origin.longitude !== 0) return; // pickup set — don't resize until destination set
    const id = setTimeout(() => {
      if (!mapRef.current) return;
      const m = mapRef.current as any;
      if (m.animateToRegion) {
        const lat = locationRef.current.latitude;
        const lng = locationRef.current.longitude;
        const useCurrent = lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);
        const region = useCurrent
          ? { latitude: lat, longitude: lng, ...mapDelta }
          : ABAKALIKI_REGION;
        m.animateToRegion(region, 400);
      }
    }, 100);
    return () => clearTimeout(id);
  }, [isBooking, hasPickupAndDest, maps.origin.latitude, maps.origin.longitude]);

  // When booking sheet is open with both locations, force map to fit route (avoids stuck world view)
  useEffect(() => {
    if (!isBooking || !hasPickupAndDest || !mapRef.current) return;
    const o = maps.origin;
    const d = maps.destination;
    if (o.latitude === 0 || o.longitude === 0 || d.latitude === 0 || d.longitude === 0) return;
    if (Math.abs(d.latitude) < 0.01 && Math.abs(d.longitude) < 0.01) return;
    const map = mapRef.current as any;
    const id = setTimeout(() => {
      const distanceKm = haversineKm(o, d);
      if (distanceKm <= MAX_FIT_DISTANCE_KM) {
        mapRef.current?.animateToRegion({
          latitude: (o.latitude + d.latitude) / 2,
          longitude: (o.longitude + d.longitude) / 2,
          latitudeDelta: Math.max(Math.abs(o.latitude - d.latitude) * 2.5, 0.015),
          longitudeDelta: Math.max(Math.abs(o.longitude - d.longitude) * 2.5, 0.015),
        }, 600);
      } else if (map.animateToRegion) {
        map.animateToRegion({ latitude: o.latitude, longitude: o.longitude, ...mapDelta }, 400);
      }
    }, 150);
    return () => clearTimeout(id);
  }, [isBooking, hasPickupAndDest, maps.origin.latitude, maps.origin.longitude, maps.destination.latitude, maps.destination.longitude]);

  // When user returns to home tab with valid location and no route, center map on current location
  const lastFocusedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const focusLostToBackgroundRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current === "active" && nextState.match(/inactive|background/)) {
        focusLostToBackgroundRef.current = true;
      }
      if (nextState === "active") {
        focusLostToBackgroundRef.current = false;
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isFocused) {
      if (!focusLostToBackgroundRef.current) {
        lastFocusedRef.current = false;
      }
      return;
    }
    if (!hasValidLocation || maps.origin.latitude !== 0 || maps.destination.latitude !== 0) return;
    if (lastFocusedRef.current) return; // Already centered this focus
    lastFocusedRef.current = true;
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        ...mapDelta,
      }, 600);
      logger.debug("Map centered on current location (tab focused)", {
        lat: location.latitude,
        lng: location.longitude,
      });
    }
  }, [isFocused, hasValidLocation, location.latitude, location.longitude, maps.origin.latitude, maps.destination.latitude]);

  const CancelBooking = (
    booking_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    apiClient
      .post("schedule/cancel/booking", { booking_id })
      .then(async () => {
        await suppressScheduleBookingForHomePreview(booking_id);
        safeShowMessage({
          type: "success",
          message: "Booking cancelled successfully",
        });
        setBooking({});
        setViewbooking({});
        await AsyncStorage.removeItem("dismissedBookingId");
        setDismissedBookingId(null);
        clearRideState();
        bookingViewSheetRef?.current?.close();
        getActiveBooking();
      })
      .catch(async (err) => {
        const status = err?.response?.status || err?.status;
        
        // Silently handle 404 errors - endpoint may not exist or booking already cancelled
        if (status === 404) {
          logger.debug("Cancel booking endpoint not found (404) - booking may already be cancelled", { booking_id });
          await suppressScheduleBookingForHomePreview(booking_id);
          safeShowMessage({
            type: "info",
            message: "Booking may have already been cancelled or completed.",
          });
          setBooking({});
          setViewbooking({});
          clearRideState();
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
    visible: !!token,
    onEvent: (event) => {
      const payload = parsePusherDataPayload((event as { data?: unknown }).data);
      logger.info(`Driver cancelled event received: ${String((event as { eventName?: string })?.eventName)}`);
      handleRideCancelled(payload);
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
      const payload = parsePusherDataPayload(event?.data);
      const fareRaw = payload?.fare;
      const rideIdEvt =
        payload?.ride_id != null ? String(payload.ride_id) : "";
      const fareStr =
        fareRaw != null && fareRaw !== ""
          ? String(Math.round(Number(fareRaw)))
          : undefined;
      invalidateRecentPlacesCache();
      openPostRideSummary({
        ride_id: rideIdEvt || (tempRef.current?.ride_id as string) || (tempRef.current as { _id?: string })?._id,
        ...(fareStr ? { cost: fareStr } : {}),
        ...(payload?.payment_status != null
          ? { payment_status: payload.payment_status as string }
          : {}),
      } as Partial<TRide> & Record<string, unknown>);
    },
  });

  // Subscribe to ride status updates for active rides
  const activeRideId = temp?.ride_id || (ride?.data?.waiting as any)?.ride_id;
  const rideStatus = String(
    (temp?.status as string) ||
      ((ride?.data?.waiting as any)?.status as string) ||
      ""
  ).toLowerCase();
  const rideChannel = activeRideId ? `private.ride.${activeRideId}` : 'private.ride.dummy';
  usePusherChannel({
    channel: rideChannel,
    visible:
      !!activeRideId &&
      rideStatus !== "completed" &&
      rideStatus !== "cancelled" &&
      rideStatus !== "rejected",
    onSubscriptionSucceeded: () => {
      if (activeRideId) {
        logger.debug(`Subscribed to ride status updates for ride ${activeRideId}`);
      }
    },
    onEvent: (event) => {
      if (!activeRideId) return;
      const name = (event as { eventName?: string })?.eventName;
      const payload = parsePusherDataPayload((event as { data?: unknown }).data);
      if (name === "ride.status" && payload) {
        const st = String(
          payload.internal_status ?? payload.status ?? ""
        ).toLowerCase();
        if (st === "cancelled" || st === "canceled") {
          handleRideCancelled(payload);
          return;
        }
        applyPusherRideStatusPatchFn(payload);
        setTimeout(() => getActiveRide(), 600);
        return;
      }
      if (
        name === "ride_cancelled" ||
        name === "ride-cancelled" ||
        name === "RIDE_CANCELLED" ||
        name === "driver_cancelled"
      ) {
        handleRideCancelled(payload);
        return;
      }
      if (
        (name === "ride_accepted" || name === "RIDE_ACCEPTED") &&
        payload
      ) {
        const rideId = String(payload.ride_id ?? payload.rideId ?? activeRideId);
        applyRideAcceptedPatchFn(rideId, payload);
        setTimeout(() => getActiveRide(), 600);
        return;
      }
      logger.info(`Ride channel event: ${String(name || "unknown")}`);
      getActiveRide();
    },
  });

  const riderPusherUserId =
    user?.profile?.user_id ?? (user?.profile as { _id?: string } | undefined)?._id ?? null;

  const riderUserChannel =
    riderPusherUserId != null
      ? `private-user-${String(riderPusherUserId)}`
      : "private-user-off";

  usePusherChannel({
    channel: riderUserChannel,
    visible: !!token && riderPusherUserId != null,
    onEvent: (event: { eventName?: string; data?: unknown }) => {
      const name = event?.eventName;
      if (!name) return;

      const payload = parsePusherDataPayload(event?.data);
      if (!payload) return;

      if (name === "ride.status") {
        const st = String(
          payload.internal_status ?? payload.status ?? ""
        ).toLowerCase();
        if (st === "cancelled" || st === "canceled") {
          handleRideCancelled(payload);
          return;
        }
        applyPusherRideStatusPatchFn(payload);
        setTimeout(() => getActiveRide(), 600);
        return;
      }

      const subTypeEarly =
        payload?.subType ?? payload?.event_key ?? payload?.sub_type ?? name;
      if (
        subTypeEarly === "driver_cancelled" ||
        subTypeEarly === "ride_cancelled_by_driver" ||
        subTypeEarly === "ride_cancelled" ||
        name === "ride_cancelled" ||
        name === "ride-cancelled" ||
        name === "driver_cancelled"
      ) {
        handleRideCancelled(payload);
        return;
      }
      if (
        subTypeEarly === "ride_accepted" ||
        name === "ride_accepted" ||
        name === "RIDE_ACCEPTED"
      ) {
        const rideId = String(
          payload.ride_id ?? payload.rideId ?? activeRideId ?? ""
        ).trim();
        if (rideId) {
          applyRideAcceptedPatchFn(rideId, payload);
          setTimeout(() => getActiveRide(), 600);
        }
        return;
      }

      const activeRiderRideId = String(
        temp?.ride_id ??
          (temp as any)?._id ??
          (ride?.data?.waiting as any)?.ride_id ??
          (ride?.data?.waiting as any)?._id ??
          ""
      );

      if (name === "driver-location-update") {
        const rideIdEvt = payload.rideId != null ? String(payload.rideId) : "";
        if (rideIdEvt && activeRiderRideId && rideIdEvt !== activeRiderRideId) {
          return;
        }
        const lat = Number(payload.lat);
        const lng = Number(payload.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const headingRaw = payload.heading;
        const heading =
          headingRaw != null && headingRaw !== "" && !Number.isNaN(Number(headingRaw))
            ? Number(headingRaw)
            : null;
        dispatch(
          setRideUtils({
            driverLiveLocation: { lat, lng, heading },
          })
        );
        return;
      }

      if (name === "driver-arrived") {
        const dn = payload.driverName != null ? String(payload.driverName) : "Driver";
        const vi = payload.vehicleInfo != null ? String(payload.vehicleInfo) : "";
        const plate = payload.plateNumber != null ? String(payload.plateNumber) : "";
        const desc = [vi, plate].filter(Boolean).join(" • ");
        safeShowMessage({
          type: "success",
          message: `${dn} has arrived`,
          ...(desc ? { description: desc } : {}),
          duration: 8000,
        });
        getActiveRide();
        return;
      }

      if (name === "payment-confirmed") {
        const amt = Number(payload.amount ?? 0);
        safeShowMessage({
          type: "success",
          message: "Payment confirmed",
          description: `₦${Number.isFinite(amt) ? amt.toLocaleString() : String(payload.amount ?? "")} cash — thank you!`,
          duration: 5000,
        });
        getActiveRide();
        return;
      }

      // ── Ride state alerts ────────────────────────────────────────────────
      const subType = payload?.subType ?? payload?.event_key ?? name;

      if (subType === "fare_locked") {
        const amt = payload?.amount ?? payload?.fare ?? payload?.cost ?? null;
        safeShowMessage({
          type: "info",
          message: "Your fare is locked 🔒",
          description: amt
            ? `₦${Number(amt).toLocaleString()} is fixed — no cash needed at pickup.`
            : "Your fare is fixed in the app. No cash needed at pickup.",
          duration: 6000,
        });
        getActiveRide();
        return;
      }

      if (subType === "ride_started") {
        safeShowMessage({
          type: "success",
          message: "Ride started 🚀",
          description: "You're on your way! Sit back and relax.",
          duration: 6000,
        });
        getActiveRide();
        return;
      }

      if (subType === "ride_completed" || subType === "trip:completed" || subType === "ride.completed") {
        safeShowMessage({
          type: "success",
          message: "Ride completed ✅",
          description: "Thanks for riding with Keke!",
          duration: 6000,
        });
        getActiveRide();
        return;
      }

      if (name === "ride:approaching_destination") {
        safeShowMessage({
          type: "success",
          message: "Almost there! 🎯",
          description: "You're approaching your destination.",
          duration: 6000,
        });
        return;
      }

      if (subType === "driver_arrived" || name === "driver_arrived") {
        const dn = payload.driverName != null ? String(payload.driverName) : "Driver";
        const vi = payload.vehicleInfo != null ? String(payload.vehicleInfo) : "";
        const plate = payload.plateNumber != null ? String(payload.plateNumber) : "";
        const desc = [vi, plate].filter(Boolean).join(" • ");
        safeShowMessage({
          type: "success",
          message: `${dn} has arrived 📍`,
          ...(desc ? { description: desc } : {}),
          duration: 8000,
        });
        getActiveRide();
        return;
      }
      // ── End ride state alerts ─────────────────────────────────────────────
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
        payment_method:
          bookingData.payment_method ||
          (bookingData as any).paymentMethod ||
          bookingData.payment_type ||
          'wallet',
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
        payment_method:
          bookingData.payment_method ||
          (bookingData as any).paymentMethod ||
          bookingData.payment_type ||
          'wallet',
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
    if (!notificationEventMountGuardRef.current) {
      notificationEventMountGuardRef.current = true;
      return;
    }
    logger.debug("Notification event received", { event: notificationEvent });
    const notifSubType =
      notificationEvent?.data?.sub_type ??
      notificationEvent?.data?.subType ??
      "";
    const notifRideId = String(
      notificationEvent?.data?.rideId ??
        notificationEvent?.data?.ride_id ??
        ""
    ).trim();

    if (notifSubType === "ride_accepted" && notifRideId) {
      applyRideAcceptedPatchFn(notifRideId);
      getActiveRide();
    }

    const rideLifecycleRefreshKeys = new Set([
      "driver_arrived",
      "ride_arrived",
      "ride_started",
      "ride_completed",
    ]);
    if (rideLifecycleRefreshKeys.has(notifSubType) && notifRideId) {
      getActiveRide();
    }

    if (
      notifSubType === "ride_cancelled_by_driver" ||
      notifSubType === "driver_cancelled"
    ) {
      // GET active-ride reflects terminal cancel vs rematching; Pusher may also fire.
      getActiveRide();
    }

    const silentRideKeys = new Set([
      "ride_accepted",
      "ride_cancelled_by_driver",
      "driver_cancelled",
      ...rideLifecycleRefreshKeys,
    ]);
    if (
      notificationEvent?.body !== "" &&
      !silentRideKeys.has(notifSubType)
    ) {
      safeShowMessage({ message: notificationEvent?.body, type: "info" });
    }

    if (notificationEvent?.data?.sub_type === "private.completed_ride") {
      tripCompletedRef.current = false;
      setTripCompleted(false);
      setPaymentReceipt(false);
      getActiveRide();
    }
    if (notificationEvent?.data?.sub_type === "private.payment") {
      setTripCompleted(false);
      setPaymentReceipt(true);
      getActiveRide();
    }
  }, [notificationEvent, applyRideAcceptedPatchFn, handleRideCancelled]);

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

  const { showReturnToLiveRide, showDismissedBookingChip } = useMemo(() => {
    const waitingData = ride?.data?.waiting as any;
    const activeRideIdForPill =
      temp?.ride_id ||
      (temp as any)?._id ||
      waitingData?.ride_id ||
      waitingData?._id;
    const activeRideStatus = String(
      temp?.status ?? waitingData?.status ?? ""
    ).toLowerCase();
    const hasOngoingLiveRide =
      !!activeRideIdForPill &&
      !["completed", "cancelled", "rejected"].includes(activeRideStatus);

    const bookingStatusNorm = normalizeBookingListStatus(booking?.status);
    const bookingCardVisible =
      Object.keys(booking).length > 0 &&
      !isTerminalScheduleListStatus(bookingStatusNorm) &&
      dismissedBookingId !== booking?.booking_id;

    const bookingKey = String(
      (booking as any)?.ride_id ?? booking?.booking_id ?? ""
    );
    const sameRideAsBookingCard =
      bookingKey !== "" &&
      String(activeRideIdForPill ?? "") === bookingKey;

    return {
      showReturnToLiveRide:
        hasOngoingLiveRide && !(bookingCardVisible && sameRideAsBookingCard),
      showDismissedBookingChip:
        Object.keys(booking).length > 0 &&
        !isTerminalScheduleListStatus(bookingStatusNorm) &&
        dismissedBookingId != null &&
        String(dismissedBookingId) === String(booking?.booking_id),
    };
  }, [ride?.data?.waiting, temp, booking, dismissedBookingId]);

  const restoreDismissedBookingBanner = useCallback(async () => {
    await AsyncStorage.removeItem("dismissedBookingId");
    setDismissedBookingId(null);
  }, []);

  const activeRidePayloadId = useMemo(() => {
    const waiting = ride?.data?.waiting as any;
    return (
      temp?.ride_id ||
      (temp as any)?._id ||
      waiting?.ride_id ||
      waiting?._id ||
      null
    );
  }, [temp, ride?.data?.waiting]);

  const shouldRenderActiveRideSheet = useMemo(() => {
    const screen = String(ride?.screen ?? "");
    const hasScreen = screen.length > 0;
    const waiting = ride?.data?.waiting as any;
    const hasWaitingPayload =
      waiting && typeof waiting === "object" && Object.keys(waiting).length > 0;
    const hasTempPayload =
      temp && typeof temp === "object" && Object.keys(temp as any).length > 0;
    return !!(hasScreen || activeRidePayloadId || hasWaitingPayload || hasTempPayload);
  }, [ride?.screen, ride?.data?.waiting, temp, activeRidePayloadId]);

  const openActiveRideSheet = useCallback(() => {
    if (!activeRidePayloadId) {
      // Avoid opening a blank sheet if user taps quickly before active-ride fetch returns.
      getActiveRide();
      return;
    }
    activeRideSheetRef?.current?.open();
  }, [activeRidePayloadId, getActiveRide]);

  /** Home preview card from schedule/latest/booking (scheduled / pending) — not an on-demand compose session. */
  const bookingHomePreviewVisible =
    Object.keys(booking).length > 0 &&
    !isTerminalScheduleListStatus(normalizeBookingListStatus(booking?.status)) &&
    dismissedBookingId !== booking?.booking_id;

  /**
   * Pickup "X min" / arrive-by — only for Find Ride / active WAITING.
   * Scheduled-booking home still has leftover maps + route + ETA from useRoute; hide pills whenever the
   * schedule preview card is showing and the user is not composing a new ride (`!isBooking`).
   */
  const showPickupRouteEta =
    hasPickupAndDest &&
    (isBooking || ride.screen === "WAITING") &&
    !(bookingHomePreviewVisible && !isBooking);

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
          setRide((prev) => ({ ...prev, screen: "SUMMARY" }));
          activeRideSheetRef?.current?.open();
        }}
      />
      <TripCompletedModal
        // saved ride data
        cost={temp.cost}
        paymentType={temp?.payment_type}
        visible={tripCompleted}
        view="passenger"
        action={() => {
          dispatch(
            setAppData({
              isBooking: true,
            })
          );
          setTripCompleted(false);
          setRide((prev) => ({ ...prev, screen: "SUMMARY" }));
          setTimeout(() => activeRideSheetRef?.current?.open(), 200);
        }}
        onClose={() => {
          setTripCompleted(false);
          setTimeout(() => activeRideSheetRef?.current?.open(), 200);
        }}
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
        <HomeMap
          mapRef={mapRef as React.RefObject<any>}
          userLocation={
            hasValidLocation
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  heading: location.heading,
                }
              : undefined
          }
          mapState={
            ride.screen === "WAITING" || (temp?.ride_id ?? (ride?.data?.waiting as any)?._id ?? (ride?.data?.waiting as any)?.ride_id)
              ? "active"
              : hasPickupAndDest && routeCoords.length > 0
                ? "route"
                : isBooking
                  ? "searching"
                  : "idle"
          }
          pickup={
            maps.origin.latitude !== 0 && maps.origin.longitude !== 0
              ? maps.origin
              : undefined
          }
          dropoff={
            maps.destination.latitude !== 0 &&
            maps.destination.longitude !== 0 &&
            maps.destination.latitude !== 1
              ? maps.destination
              : undefined
          }
          routeCoords={routeCoords}
          routeLoading={routeLoading}
          pauseDriverUpdates={isBooking}
          riderActiveRideStatus={riderActiveRideStatusForMap || null}
          etaLabel={showPickupRouteEta && eta ? eta : null}
          arriveByLabel={
            showPickupRouteEta && routeArriveBy ? `Arrive by ${routeArriveBy}` : null
          }
          onRouteReady={(_coords) => {
            if (!mapRef.current) return;
            const o = maps.origin;
            const d = maps.destination;
            if (
              !o.latitude || !d.latitude ||
              Math.abs(o.latitude) < 0.01 || Math.abs(d.latitude) < 0.01
            ) return;
            const distanceKm = haversineKm(o, d);
            if (distanceKm <= MAX_FIT_DISTANCE_KM) {
              mapRef.current?.animateToRegion({
                latitude: (o.latitude + d.latitude) / 2,
                longitude: (o.longitude + d.longitude) / 2,
                latitudeDelta: Math.max(Math.abs(o.latitude - d.latitude) * 2.5, 0.015),
                longitudeDelta: Math.max(Math.abs(o.longitude - d.longitude) * 2.5, 0.015),
              }, 600);
            } else {
              (mapRef.current as any).animateToRegion?.(
                { latitude: o.latitude, longitude: o.longitude, ...mapDelta },
                400
              );
            }
          }}
        />

        <View
          style={[
            tw.style(`absolute top-0 right-0 left-0`, {
              display: isBooking ? "none" : "flex",
            }),
            {
              paddingTop: insets.top + 8,
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
            },
          ]}
        >
          {/* Top Header Bar - notification */}
          <View
            style={tw.style(
              `flex-row items-center justify-end h-[52px] bg-transparent`
            )}
          >
            <TouchableOpacity
              onPress={() => router.push("/(app)/notifications")}
              style={tw`bg-white w-[40px] h-[40px] rounded-full items-center justify-center shadow-lg relative`}
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={20}
                color="#1F2937"
              />
              {unread_count > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
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
            </TouchableOpacity>
          </View>

          {locationError ? (
            <LocationPermissionBanner
              purpose="rider"
              loading={locationLoading}
              onEnable={async () => {
                const ok = await resolveLocationPermissionFromBanner("rider");
                if (ok) await refreshLocation({ showRationale: false });
              }}
            />
          ) : locationLoading && !hasValidLocation ? (
            <View style={tw`mx-4 mt-2 px-4 py-2 bg-white/90 dark:bg-gray-800/90 rounded-xl flex-row items-center`}>
              <Text style={tw`text-gray-600 dark:text-gray-300 text-sm`}>Getting your location…</Text>
            </View>
          ) : null}

          {/* Show booking info if exists and not dismissed */}
          {Object.keys(booking).length > 0 &&
           !isTerminalScheduleListStatus(
             normalizeBookingListStatus(booking?.status)
           ) &&
           dismissedBookingId !== booking?.booking_id && (
            <View
              style={tw.style(`ml-4 bg-white p-3 shadow-xl rounded-2xl overflow-hidden relative`, {
                marginTop: -44,
                marginRight: 64,
              })}
            >
              {/* X button to dismiss - positioned with padding from edges */}
              <TouchableOpacity
                onPress={async () => {
                  const bookingId = booking?.booking_id || '';
                  if (bookingId) {
                    await AsyncStorage.setItem('dismissedBookingId', String(bookingId));
                    setDismissedBookingId(String(bookingId));
                    logger.debug('Booking dismissed by user', { bookingId: String(bookingId) });
                  }
                }}
                style={tw`absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-gray-100 items-center justify-center`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AntDesign name="close" size={15} color="#666" />
              </TouchableOpacity>
              <View style={tw`flex-row justify-between pr-7`}>
                <View style={tw`flex-1 min-w-0`}>
                  <Text
                    style={tw.style(`text-[15px] text-[#484C52]`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    Booking Date
                  </Text>
                  <Text
                    style={tw.style(`text-[24px] leading-[28px] text-base-green`, {
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
                  <View style={tw`mt-2`}>
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
                          style={tw`px-3 py-1 self-start border border-base-green rounded-[8px]`}
                        >
                          <Text
                            style={tw.style(`text-[13px] text-base-green`, {
                              fontFamily: "RobotoBold",
                            })}
                          >
                            View Driver
                          </Text>
                        </TouchableOpacity>
                        {(booking as any)?.driver_name && (
                          <View style={tw`mt-1.5`}>
                            <Text
                              style={tw.style(`text-xs text-[#666]`, {
                                fontFamily: "RobotoRegular",
                              })}
                            >
                              Driver: {(booking as any).driver_name}
                            </Text>
                            {(booking as any)?.vehicle_type && (
                              <Text
                                style={tw.style(`text-xs text-[#999] mt-0.5`, {
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
                      <View style={tw`px-3 py-1 self-start border border-gray-300 rounded-[8px] bg-gray-50`}>
                        <Text
                          style={tw.style(`text-[13px] text-gray-600`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          No driver accepted yet
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={tw`basis-[40%] ml-3 flex-1 min-w-0`}>
                  <Text
                    style={tw.style(`text-xs text-[#8F92A1] text-right mb-0.5`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Drop-off
                  </Text>
                  <Text
                    style={tw.style(`text-[14px] text-[#484C52] text-right mb-1.5`, {
                      fontFamily: "RobotoBold",
                    })}
                    numberOfLines={2}
                  >
                    {booking?.dropoff_location && booking.dropoff_location.trim() !== '' && !booking.dropoff_location.toLowerCase().includes('select')
                      ? (() => {
                          const formatted = formatAddressForDisplay(booking.dropoff_location);
                          return formatted.primary ? formatted.full : booking.dropoff_location;
                        })()
                      : "Drop-off location"}
                  </Text>
                  <View style={tw`flex-row items-center justify-end gap-x-1 mb-1.5`}>
                    <AntDesign
                      name="clock-circle"
                      size={19}
                      color={tw.color("base-green")}
                    />
                    <Text
                      style={tw.style(
                        `text-[14px] text-base-green text-right`,
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
                    style={tw.style(`text-[14px] text-[#FDBC14] text-right capitalize mb-1.5`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    {booking?.status === 'scheduled' || booking?.status === 'requested' 
                      ? 'scheduled' 
                      : booking?.status || 'pending'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => ViewBooking(booking?.booking_id as string)}
                    style={tw`px-3 py-0.5 self-end border border-blue-600 rounded-[8px]`}
                  >
                    <Text
                      style={tw.style(`text-[13px] text-blue-600`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      Details
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={tw`ml-1 mt-2 pt-2 border-t border-zinc-200`}
                onPress={() => router.push("/(app)/(tabs)/rides?tab=upcoming")}
              >
                <Text
                  style={tw.style(`text-[13px] text-base-green`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  View all Bookings
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recenter Button (Bottom Right) - Above Find Ride / Book a Ride */}
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
                logger.debug("Map recentered to user location", {
                  lat: location.latitude,
                  lng: location.longitude,
                });
              }
            }}
            style={{
              position: "absolute",
              width: 48,
              height: 48,
              bottom: insets.bottom + 16 + 120,
              right: Math.max(insets.right, 16),
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              shadowColor: "#000",
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

        {/* Where are you going? - single CTA (opens booking flow) */}
        <View
          style={[
            tw.style(`absolute left-0 right-0`, {
              display: "flex",
            }),
            {
              bottom: insets.bottom + 12,
              paddingLeft: Math.max(insets.left, 20),
              paddingRight: Math.max(insets.right, 20),
            },
          ]}
        >
          {(showDismissedBookingChip || showReturnToLiveRide) && (
            <View style={{ marginBottom: 8, gap: 8 }}>
              {showDismissedBookingChip ? (
                <TouchableOpacity
                  onPress={() => {
                    void restoreDismissedBookingBanner();
                  }}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 4,
                  }}
                >
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                    <MaterialCommunityIcons
                      name="calendar-clock"
                      size={22}
                      color={tw.color("base-green") ?? "#2E7D52"}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={tw.style(`text-[14px] text-[#1A1A1A]`, {
                          fontFamily: "RobotoBold",
                        })}
                      >
                        Booking minimized
                      </Text>
                      <Text
                        style={tw.style(`text-[12px] text-[#6B7280] mt-0.5`, {
                          fontFamily: "RobotoRegular",
                        })}
                        numberOfLines={1}
                      >
                        Tap to show your scheduled ride again
                      </Text>
                    </View>
                  </View>
                  <AntDesign name="right" size={16} color="#6B7280" />
                </TouchableOpacity>
              ) : null}
              {showReturnToLiveRide ? (
                <TouchableOpacity
                  onPress={openActiveRideSheet}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: tw.color("base-green") ?? "#2E7D52",
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                    elevation: 4,
                  }}
                >
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                    <MaterialCommunityIcons name="car" size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "RobotoBold",
                          fontSize: 14,
                          color: "#FFFFFF",
                        }}
                      >
                        Ride in progress
                      </Text>
                      <Text
                        style={{
                          fontFamily: "RobotoRegular",
                          fontSize: 12,
                          color: "rgba(255,255,255,0.9)",
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        Tap to open trip details
                      </Text>
                    </View>
                  </View>
                  <AntDesign name="right" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {/* Where are you going? — opens find-ride flow (unchanged); only schedule actions open Book a Ride sheet */}
          {!loading && (
            <TouchableOpacity
              onPress={() => {
                openFindRideSheet();
              }}
              style={tw.style(
                `rounded-full flex-row items-center`,
                {
                  backgroundColor: tw.color("base-green") ?? "#3C8F7C",
                  paddingHorizontal: 18,
                  paddingVertical: 16,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.12,
                  shadowRadius: 10,
                  elevation: 10,
                }
              )}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color="#FFFFFF"
                style={tw`mr-3`}
              />
              <Text
                style={tw.style(`text-[15px] text-white`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Where are you going?
              </Text>
            </TouchableOpacity>
          )}
          {/* Schedule a ride for later — card CTA opens schedule sheet */}
          <TouchableOpacity
            onPress={() => {
              dispatch(setAppData({ isBooking: true }));
              setBookRideOpenVersion((value) => value + 1);
              setTimeout(() => bookRideSheetRef?.current?.open(), 100);
            }}
            activeOpacity={0.75}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: "#1A1A1A",
              paddingVertical: 12,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              marginTop: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 12 }}>📅</Text>
            <View style={tw`flex-1`}>
              <Text
                style={tw.style(`text-[14px] text-[#1A1A1A]`, {
                  fontFamily: "RobotoBold",
                  fontWeight: "600",
                })}
              >
                Schedule a ride for later
              </Text>
              <Text
                style={[
                  tw.style(`text-[12px] text-[#757575]`, { fontFamily: "RobotoRegular" }),
                  { marginTop: 2 },
                ]}
              >
                Plan your trip in advance
              </Text>
            </View>
            <Text
              style={[
                tw.style(`text-[18px]`, { fontFamily: "RobotoRegular" }),
                { color: tw.color("base-green") ?? "#2E7D52" },
              ]}
            >
              →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <Portal>
        <EmergencyModal bottomSheetRef={emergencySheetRef} />
      </Portal>
      <Portal>
        <BookRideSheet
          bottomSheetRef={bookRideSheetRef}
          getActiveBooking={getActiveBooking}
          openVersion={bookRideOpenVersion}
        />
      </Portal>
      <Portal>
        <FindRideSheet
          bottomSheetRef={rideSheetRef}
          getActiveRide={getActiveRide}
          onSheetClose={() => setInitialDropoff(null)}
          initialDropoff={initialDropoff}
          onRideBooked={(confirmedRide) => {
            justBookedRef.current = true;
            if (justBookedTimerRef.current) clearTimeout(justBookedTimerRef.current);
            // Auto-clear after 30 s so stale grace periods don't persist forever.
            justBookedTimerRef.current = setTimeout(() => {
              justBookedRef.current = false;
            }, 30_000);

            const raw =
              confirmedRide &&
              typeof confirmedRide === "object" &&
              !Array.isArray(confirmedRide)
                ? (confirmedRide as Record<string, unknown>)
                : null;
            if (!raw) return;

            const rid = getActiveRideId(raw);
            if (!rid) return;

            const rideStatus = getRideStatusLower(raw);
            if (
              isTerminalRideStatus(rideStatus) ||
              !isRestorableRideStatus(rideStatus)
            ) {
              return;
            }

            pendingConfirmHydrationRef.current = true;
            if (pendingConfirmHydrationTimerRef.current) {
              clearTimeout(pendingConfirmHydrationTimerRef.current);
            }
            pendingConfirmHydrationTimerRef.current = setTimeout(() => {
              pendingConfirmHydrationRef.current = false;
              pendingConfirmHydrationTimerRef.current = null;
            }, CONFIRM_HYDRATION_TTL_MS);

            const rideUiKey = `${rid}|${rideStatus}|${String(raw.accepted_by_driver)}|${String(raw.driver_id ?? "")}|${String(raw.is_ride_started)}|${String(raw.drop_off_completed)}|${String(raw.payment_status ?? "")}|${raw.internal_status ?? ""}`;
            lastActiveRideUiKeyRef.current = rideUiKey;

            setTemp(raw as TRide);
            setRide({
              screen: "WAITING",
              data: {
                waiting: raw as unknown as IARide["data"]["waiting"],
              },
            });
            dispatch(
              setAppData({
                isBooking: true,
              })
            );
            animateToMapDirections(raw as unknown as IARide["data"]["waiting"]);

            setTimeout(() => {
              logger.debug("Opening active ride sheet (confirm-ride hydration)");
              activeRideSheetRef?.current?.open();
            }, 300);
            setTrigger(Math.random());
          }}
        />
      </Portal>
      <Portal>
        {shouldRenderActiveRideSheet ? (
          <ActiveRideSheet
            key={trigger}
            temp={temp}
            setTemp={setTemp}
            currentView={ride}
            setCurrentView={setRide}
            bottomSheetRef={activeRideSheetRef}
            getActiveRide={getActiveRide}
            clearMap={clearRideState}
            onTripCompleted={(snapshot) => {
              openPostRideSummary(snapshot as Partial<TRide> & Record<string, unknown>);
            }}
            chatOpenSignal={chatOpenKick}
          />
        ) : null}
      </Portal>
    </>
  );
}
