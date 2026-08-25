import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Pressable, TouchableOpacity } from "react-native-gesture-handler";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { Path, Svg } from "react-native-svg";
import RNDateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { REQUEST_RIDE } from "@/constants";
import apiClient from "@/utils/apiClient";
import { setAppData, setRideData, AppDetailsState, type IUtils, type IUserLocation } from "@/store/AppSlice";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import {
  cancelUnpaidCardRide,
  collectRideCardPayment,
} from "@/utils/openRideCardPayment";
import { geocodeAddress, resolvePickupLabel, reverseGeocode } from "@/utils/mapsApi";
import tw from "@/lib/tailwind";
import { useDispatch, useSelector } from "react-redux";
import { useFocusEffect } from "expo-router";
import { useCombinedSafeInsets, sheetFooterBottomPadding } from "@/hooks/useCombinedSafeInsets";
import { heightAboveKeyboard, useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import CustomPlacesAutocomplete from "@/components/CustomPlacesAutocomplete";
import { formatAddressForDisplay } from "@/utils/formatAddressForDisplay";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  configToEnabledMethods,
  defaultUiPaymentKey,
  isWalletPaymentMethod,
  mapUiPaymentToApi,
  preferCashWhenWalletLow,
} from "@/utils/paymentMethods";
import { getCachedWallet, setCachedWallet } from "@/utils/walletCache";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  getActiveBooking: () => void;
  openVersion: number;
}

type ModeType = "date" | "time" | "datetime" | "countdown";

const MIN_SCHEDULE_LEAD_MINUTES = 60;

const BRAND_GREEN = tw.color("base-green") ?? "#3C8F7C";
/** Soft fill for chips / tiles — derived from brand green, avoids generic Material mint (#E8F5E9). */
const BRAND_GREEN_SURFACE = "rgba(60, 143, 124, 0.13)";

const getMinimumScheduledDateTime = (now = new Date()) => {
  const minDate = new Date(now.getTime() + MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000);
  minDate.setSeconds(0, 0);
  const roundedMinutes = Math.ceil(minDate.getMinutes() / 5) * 5;
  minDate.setMinutes(roundedMinutes, 0, 0);
  return minDate;
};

const getScheduleSelectionFromDate = (date: Date, now = new Date()) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const dayOffset = Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  );

  return {
    dayOffset,
    time: new Date(date),
  };
};

/** API responses vary: use every common label field so UI never shows blank tiles. */
const getVehicleDisplayName = (vehicle: any): string => {
  const raw =
    vehicle?.name ??
    vehicle?.displayName ??
    vehicle?.display_name ??
    vehicle?.vehicle_type ??
    vehicle?.type ??
    "";
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || "Vehicle";
};

const getVehicleLabelBlob = (vehicle: any) =>
  [
    vehicle?.name,
    vehicle?.displayName,
    vehicle?.display_name,
    vehicle?.vehicle_type,
    vehicle?.type,
  ]
    .filter((x) => x != null && String(x).trim() !== "")
    .join(" ")
    .toLowerCase();

/** Prefer keke/bike/taxi-style types; if filtering removes everything, caller should fall back to full list. */
const vehicleMatchesScheduleFilter = (vehicle: any) => {
  const blob = getVehicleLabelBlob(vehicle);
  if (!blob) return true;
  const keys = [
    "keke",
    "tricycle",
    "bike",
    "bicycle",
    "okada",
    "motor",
    "taxi",
    "cab",
    "car",
    "sedan",
    "suv",
  ];
  return keys.some((k) => blob.includes(k));
};

const BookRideSheet = ({ bottomSheetRef, getActiveBooking, openVersion }: Props) => {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useCombinedSafeInsets();
  const dispatch = useDispatch();
  const { apiConfig } = useContext(AppContext);
  const { ride } = useSelector(AppDetailsState);
  const rideUtils = ride.utils as IUtils;
  const userLocation = rideUtils.user_location as IUserLocation | undefined;
  const { location } = useCurrentLocation({ isFocused: true, purpose: "rider" });
  const [selectedDate, setSelectedDate] = useState(() => getScheduleSelectionFromDate(getMinimumScheduledDateTime()).dayOffset); // 0=Today, 1=Tomorrow, 2=day after...
  const [selectedTime, setSelectedTime] = useState(() => getScheduleSelectionFromDate(getMinimumScheduledDateTime()).time);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ModeType>("date");
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [vehicleTypesLoading, setVehicleTypesLoading] = useState(true);
  const [vehicleTypesError, setVehicleTypesError] = useState<string | null>(null);
  const [fareEstimate, setFareEstimate] = useState<{
    distance?: { value?: number; text?: string };
    fare?: {
      totalFare?: number;
      riderServiceCharge?: number;
      riderTotal?: number;
    };
  } | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const { config: publicConfig } = usePublicConfig();
  const enabledPaymentMethods = useMemo(
    () => configToEnabledMethods(publicConfig.paymentMethods),
    [publicConfig.paymentMethods]
  );

  useEffect(() => {
    if (openVersion === 0) return;
    const nextSelection = getScheduleSelectionFromDate(getMinimumScheduledDateTime());
    setSelectedDate(nextSelection.dayOffset);
    setSelectedTime(nextSelection.time);
    setShowTimePicker(false);
    setLocationSearchField(null);
    setState((prev) => ({
      ...prev,
      payment_type: defaultUiPaymentKey(publicConfig.paymentMethods),
    }));
  }, [openVersion, publicConfig.paymentMethods]);

  useEffect(() => {
    const defaultKey = defaultUiPaymentKey(publicConfig.paymentMethods);
    setState((prev) =>
      prev.payment_type && enabledPaymentMethods.some((m) => m.uiKey === prev.payment_type)
        ? prev
        : { ...prev, payment_type: defaultKey }
    );
  }, [publicConfig.paymentMethods, enabledPaymentMethods]);

  // Keep this sheet tall, but avoid forcing a near-fullscreen height on smaller content.
  const screenHeight = Dimensions.get('window').height;
  const validHeight = Math.min(Math.max(screenHeight * 0.85, 550), screenHeight * 0.95);
  const keyboardInset = useKeyboardInset(true);
  const [locationSearchField, setLocationSearchField] = useState<"pickup" | "dropoff" | null>(null);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchPinned = locationSearchField != null;
  const sheetHeight = searchPinned
    ? Math.max(280, heightAboveKeyboard(screenHeight, keyboardInset) - 8)
    : validHeight;
  const resultsMaxHeight = searchPinned
    ? Math.max(160, sheetHeight - 160)
    : 280;

  const handleLocationSearchFocus = (field: "pickup" | "dropoff") => {
    if (searchBlurTimer.current) {
      clearTimeout(searchBlurTimer.current);
      searchBlurTimer.current = null;
    }
    setLocationSearchField(field);
  };

  const handleLocationSearchBlur = () => {
    if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    searchBlurTimer.current = setTimeout(() => {
      setLocationSearchField(null);
    }, Platform.OS === "android" ? 220 : 120);
  };

  /** Percent widths collapse inside nested ScrollView + bottom sheet on iOS — use px widths. */
  const vehicleGridLayout = useMemo(() => {
    const SHEET_H_PAD = 40; // matches BottomSheet `px-5` (20 * 2)
    const GAP = 6;
    const COLS = 3;
    const w = Math.max(windowWidth || 0, Dimensions.get("window").width || 375);
    const rowW = Math.max(0, w - SHEET_H_PAD);
    const tileW = Math.max(96, Math.floor((rowW - GAP * (COLS - 1)) / COLS));
    return { rowW, tileW, GAP, COLS };
  }, [windowWidth]);
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
    const nextSelection = getScheduleSelectionFromDate(getMinimumScheduledDateTime());
    setState({
      pickup_location: "",
      dropoff_location: "",
      booking_date: "",
      booking_time: "",
      payment_type: "Wallet",
      vehicle_type_id: "",
      vehicle_type_name: "",
    });
    setSelectedDate(nextSelection.dayOffset);
    setSelectedTime(nextSelection.time);
    setFareEstimate(null);
    setPickupCoords(null);
    setDropoffCoords(null);
    bottomSheetRef?.current?.close();
    dispatch(setAppData({ isBooking: false }));
  };

  // Fetch vehicle types on mount (use apiClient for correct base URL and timeout)
  const fetchVehicleTypes = useCallback(() => {
    setVehicleTypesLoading(true);
    setVehicleTypesError(null);
    apiClient
      .get("vehicle/types", { timeout: 15000 })
      .then(({ data }) => {
        const types = data?.data?.vehicle_types ?? data?.data ?? [];
        const list = Array.isArray(types) ? types : [];
        const filteredTypes = list.filter((vehicle: any) => vehicleMatchesScheduleFilter(vehicle));
        const toShow = filteredTypes.length > 0 ? filteredTypes : list;
        setVehicleTypes(toShow);
        setVehicleTypesError(null);
        // Set default vehicle type if user hasn't selected one yet
        if (toShow.length > 0) {
          const defaultType = toShow[0];
          const defaultId = String(defaultType.vehicle_id ?? defaultType._id ?? defaultType.id ?? "");
          const defaultName = getVehicleDisplayName(defaultType);
          if (defaultId && defaultId !== "undefined") {
            setState((prev) =>
              prev.vehicle_type_id ? prev : { ...prev, vehicle_type_id: defaultId, vehicle_type_name: defaultName }
            );
          }
        }
      })
      .catch((err) => {
        console.warn("Error fetching vehicle types:", err?.message ?? err?.response?.data);
        setVehicleTypes([]);
        setVehicleTypesError(err?.message ?? "Could not load vehicle types");
      })
      .finally(() => {
        setVehicleTypesLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchVehicleTypes();
  }, [fetchVehicleTypes]);

  // Set pickup location from user's current location - use backend resolver for a readable name
  useEffect(() => {
    if (!location || location.latitude === 0 || location.longitude === 0) return;

    const pickupAddress = userLocation?.name || userLocation?.formatted_address;
    if (typeof pickupAddress === 'string' && pickupAddress.trim() && pickupAddress.trim().toLowerCase() !== 'location' && !pickupAddress.includes("Current Location")) {
      setState((prev) => ({ ...prev, pickup_location: pickupAddress }));
      setPickupCoords({ lat: location.latitude, lng: location.longitude });
      return;
    }

    setPickupCoords({ lat: location.latitude, lng: location.longitude });
    setState((prev) => ({ ...prev, pickup_location: "Current location" }));

    resolvePickupLabel(location.latitude, location.longitude)
      .then((address) => {
        if (address && typeof address === 'string' && address.trim().toLowerCase() !== 'location') {
          setState((prev) => ({ ...prev, pickup_location: address }));
        }
      })
      .catch(() => {});
  }, [location, userLocation]);

  // Sync pickup/dropoff to Redux so home map recenters and shows route when Schedule sheet is open
  useEffect(() => {
    const hasValidPickup =
      pickupCoords &&
      typeof pickupCoords.lat === 'number' &&
      typeof pickupCoords.lng === 'number' &&
      pickupCoords.lat !== 0 &&
      pickupCoords.lng !== 0;

    const hasValidDropoff =
      dropoffCoords &&
      typeof dropoffCoords.lat === 'number' &&
      typeof dropoffCoords.lng === 'number' &&
      dropoffCoords.lat !== 0 &&
      dropoffCoords.lng !== 0;

    if (!hasValidPickup) {
      dispatch(setRideData({ origin: {}, destination: {} } as any));
      return;
    }

    dispatch(
      setRideData({
        origin: {
          lat: String(pickupCoords!.lat),
          long: String(pickupCoords!.lng),
          name: state.pickup_location || 'Pickup',
        },
        destination: hasValidDropoff
          ? {
              lat: String(dropoffCoords!.lat),
              long: String(dropoffCoords!.lng),
              name: state.dropoff_location || 'Drop-off',
            }
          : { lat: '', long: '', name: '' },
      } as any)
    );
  }, [pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng, state.pickup_location, state.dropoff_location, dispatch]);

  // Fare from server (admin pricing + surge + fee settings)
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords || !state.vehicle_type_id) {
      setFareEstimate(null);
      return;
    }
    let cancelled = false;
    apiClient
      .get("booking/destination-details", {
        params: {
          pickupLocation: JSON.stringify({ lat: pickupCoords.lat, lng: pickupCoords.lng }),
          dropoffLocation: JSON.stringify({ lat: dropoffCoords.lat, lng: dropoffCoords.lng }),
          vehicleTypeId: state.vehicle_type_id,
        },
      })
      .then(({ data }) => {
        if (!cancelled) setFareEstimate(data?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setFareEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    pickupCoords?.lat,
    pickupCoords?.lng,
    dropoffCoords?.lat,
    dropoffCoords?.lng,
    state.vehicle_type_id,
  ]);

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

  const handleUseCurrentLocation = async () => {
    if (!location || location.latitude === 0 || location.longitude === 0) {
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

    setPickupCoords({ lat: location.latitude, lng: location.longitude });
    setState((prev) => ({ ...prev, pickup_location: "Current location" }));

    try {
      const address = await resolvePickupLabel(location.latitude, location.longitude);
      if (address && typeof address === 'string' && address.trim().toLowerCase() !== 'location') {
        setState((prev) => ({ ...prev, pickup_location: address }));
      }
    } catch (_) {}

    safeShowMessage({
      type: accuracy < 20 ? "success" : "info",
      message: "Using current location",
    });
  };

  const handleVehicleTypeSelect = (vehicle: any) => {
    // Vehicle objects use vehicle_id field, not _id or id
    const vehicleId = String(vehicle.vehicle_id || vehicle._id || vehicle.id || '');
    const vehicleName = getVehicleDisplayName(vehicle);
    console.log('🚗 Vehicle selected:', { vehicleId, vehicleName, vehicle });
    setState((prev) => ({
      ...prev,
      vehicle_type_id: vehicleId,
      vehicle_type_name: vehicleName,
    }));
  };

  const buildScheduledDateTime = (): Date => {
    const base = new Date();
    base.setDate(base.getDate() + selectedDate);
    base.setHours(selectedTime.getHours());
    base.setMinutes(selectedTime.getMinutes());
    base.setSeconds(0);
    base.setMilliseconds(0);
    return base;
  };

  const ensureValidScheduleSelection = useCallback(
    (dayOffset: number, timeValue: Date, notify = false) => {
      const candidate = new Date();
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);

      const minimum = getMinimumScheduledDateTime();
      if (candidate >= minimum) {
        return {
          dayOffset,
          time: timeValue,
          adjusted: false,
        };
      }

      const fallback = getScheduleSelectionFromDate(minimum);
      if (notify) {
        safeShowMessage({
          type: "info",
          message: "Scheduled rides must be at least 1 hour ahead",
        });
      }

      return {
        dayOffset: fallback.dayOffset,
        time: fallback.time,
        adjusted: true,
      };
    },
    []
  );

  const handleSelectedDateChange = useCallback(
    (dayOffset: number) => {
      const next = ensureValidScheduleSelection(dayOffset, selectedTime, dayOffset === 0);
      setSelectedDate(next.dayOffset);
      setSelectedTime(next.time);
    },
    [ensureValidScheduleSelection, selectedTime]
  );

  const handleSelectedTimeChange = useCallback(
    (timeValue: Date, notify = false) => {
      const next = ensureValidScheduleSelection(selectedDate, timeValue, notify);
      setSelectedDate(next.dayOffset);
      setSelectedTime(next.time);
    },
    [ensureValidScheduleSelection, selectedDate]
  );

  const fareSummary = useMemo(() => {
    const f = fareEstimate?.fare;
    if (!f || f.totalFare == null) return null;
    const rideFare = Number(f.totalFare);
    const serviceCharge = Number(f.riderServiceCharge ?? 0);
    const riderTotal =
      f.riderTotal != null ? Number(f.riderTotal) : rideFare + serviceCharge;
    return {
      rideFare,
      serviceCharge,
      totalFare: riderTotal,
      distanceKm: fareEstimate?.distance?.value ?? 0,
    };
  }, [fareEstimate]);

  const canShowFinanceSummary = Boolean(
    state.pickup_location &&
      state.dropoff_location &&
      state.vehicle_type_id &&
      fareSummary
  );

  useEffect(() => {
    if (!fareSummary?.totalFare) return;
    setState((prev) => ({
      ...prev,
      payment_type: preferCashWhenWalletLow(
        publicConfig.paymentMethods,
        prev.payment_type,
        walletAvailableBalance,
        fareSummary.totalFare
      ),
    }));
  }, [publicConfig.paymentMethods, walletAvailableBalance, fareSummary?.totalFare]);

  useEffect(() => {
    if (!canShowFinanceSummary) {
      setWalletAvailableBalance(null);
      return;
    }

    let mounted = true;
    const cachedWallet = getCachedWallet<any>();
    const walletPromise = cachedWallet
      ? Promise.resolve(cachedWallet)
      : apiClient.get("wallet", { timeout: 10000 }).then((res) => {
          setCachedWallet(res);
          return res;
        });

    walletPromise
      .then((walletRes) => {
        if (!mounted) return;
        const data = walletRes?.data?.data;
        const available = data?.availableBalance ?? data?.balance;
        const num = typeof available === "number" ? available : Number(available || 0);
        setWalletAvailableBalance(Number.isFinite(num) ? num : 0);
      })
      .catch(() => {
        if (!mounted) return;
        setWalletAvailableBalance(null);
      });

    return () => {
      mounted = false;
    };
  }, [canShowFinanceSummary]);

  const handleSubmit = async () => {
    if (!state.pickup_location || !state.dropoff_location) {
      safeShowMessage({
        type: "danger",
        message: "Please enter both pickup and destination locations",
      });
      return;
    }

    // Date/time come from selectedDate and selectedTime (chips + picker); validated below when building scheduled datetime

    if (!state.payment_type) {
      safeShowMessage({
        type: "danger",
        message: "Please select a payment method",
      });
      return;
    }

    const paymentMethod = mapUiPaymentToApi(state.payment_type);
    if (
      isWalletPaymentMethod(paymentMethod) &&
      walletAvailableBalance != null &&
      fareSummary?.totalFare &&
      walletAvailableBalance < fareSummary.totalFare
    ) {
      safeShowMessage({
        type: "warning",
        message: "Insufficient wallet balance. Choose Cash or top up your wallet.",
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
        pickupAddress = state.pickup_location || userLocation?.formatted_address || "Current location";
        pickupName = userLocation?.name || pickupAddress.split(',')[0];
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

      const scheduledDateTime = buildScheduledDateTime();
      const minimumScheduledDateTime = getMinimumScheduledDateTime();
      if (scheduledDateTime < minimumScheduledDateTime) {
        const nextSelection = getScheduleSelectionFromDate(minimumScheduledDateTime);
        setSelectedDate(nextSelection.dayOffset);
        setSelectedTime(nextSelection.time);
        safeShowMessage({
          type: "danger",
          message: "Scheduled time must be at least 1 hour from now",
        });
        setLoading(false);
        return;
      }

      // Map payment type to backend format
      const paymentMethodForRequest = mapUiPaymentToApi(state.payment_type);

      // Prepare request data (scheduledFor for payload shape; backend accepts scheduledAt)
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
        paymentMethod: paymentMethodForRequest,
        scheduledFor: scheduledDateTime.toISOString(),
        scheduledAt: scheduledDateTime.toISOString(),
      };

      console.log('📤 Scheduling ride:', requestData);

      const { data } = await apiClient.post(REQUEST_RIDE, requestData);
      const ridePayload = data?.data?.ride ?? data?.data ?? null;
      const paymentRequired = Boolean(data?.data?.payment_required);
      const rideIdForPay = String(
        ridePayload?.ride_id || ridePayload?._id || ridePayload?.id || ""
      ).trim();

      if (paymentRequired && rideIdForPay) {
        const paid = await collectRideCardPayment(rideIdForPay, safeShowMessage);
        if (!paid) {
          await cancelUnpaidCardRide(rideIdForPay, true);
          safeShowMessage({
            type: "warning",
            message: "Card payment was not completed. Booking was cancelled.",
            duration: 4500,
          });
          setLoading(false);
          return;
        }
      }

      getActiveBooking();
      safeShowMessage({
        type: "success",
        message: paymentRequired
          ? "Payment confirmed. Ride scheduled successfully"
          : data?.message || "Ride scheduled successfully",
      });
      handleBack();
    } catch (error: any) {
      const isGeocodeError = error?.message?.includes('axios') || !error?.response;
      if (isGeocodeError) {
        console.log('Geocoding error:', error);
      } else {
        console.log('Schedule ride error:', error?.response?.data);
      }
      const errorMessage = getErrorMessage(error);
      safeShowMessage({
        type: "danger",
        message: errorMessage || "Failed to process locations. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get vehicle icon based on type
  const getVehicleIcon = (vehicleType: string) => {
    const type = vehicleType.toLowerCase();
    const iconSize = 26; // ~20% smaller than before for reduced card size
    if (type.includes('keke') || type.includes('tricycle')) {
      return <MaterialCommunityIcons name="rickshaw" size={iconSize} color={BRAND_GREEN} />;
    } else if (type.includes('okada') || type.includes('bike') || type.includes('motorcycle')) {
      return <MaterialCommunityIcons name="motorbike" size={iconSize} color={BRAND_GREEN} />;
    } else {
      return <MaterialCommunityIcons name="car" size={iconSize} color={BRAND_GREEN} />;
    }
  };

  return (
    <>
      <Modal
        visible={show}
        transparent
        animationType="slide"
        onRequestClose={() => setShow(false)}
      >
        <Pressable
          style={tw.style("flex-1 justify-end bg-black/50")}
          onPress={() => setShow(false)}
        >
          <Pressable
            style={tw.style("bg-white rounded-t-2xl pt-2 pb-6 px-4")}
            onPress={(e) => {
              const ev = e as unknown as { stopPropagation?: () => void };
              ev.stopPropagation?.();
            }}
          >
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
              display={Platform.OS === "ios" ? "spinner" : "default"}
            />
          </Pressable>
        </Pressable>
      </Modal>
      <BottomSheet
        height={sheetHeight}
        ref={bottomSheetRef}
        animationType="spring"
        backdropMaskColor="#19191900"
        openDuration={1000}
        closeDuration={1000}
        disableKeyboardHandling={true}
        disableBodyPanning={true}
        style={tw.style(`px-5 py-4 rounded-t-[32px] bg-white`)}
        closeOnDragDown={false}
      >
        <View
          style={{
            flex: 1,
            minHeight: Math.min(sheetHeight - 48, screenHeight * 0.9),
          }}
        >
          {/* Header */}
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <View style={tw`w-[28px]`} />
            <View style={tw`flex-row items-center flex-1 justify-center px-2`}>
              <MaterialCommunityIcons name="calendar-clock" size={20} color="#242E42" style={tw`mr-1.5`} />
            <Text
              style={tw.style(`text-[22px] text-[#242E42]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Schedule a ride for later
            </Text>
            </View>
            <TouchableOpacity
              onPress={handleBack}
              style={tw`h-[32px] w-[32px] items-center justify-center`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AntDesign name="close" size={17} color="#242E42" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: searchPinned
                ? 12
                : sheetFooterBottomPadding(insets.bottom),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={!searchPinned}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* Date + time */}
            {!searchPinned ? (
            <>
            <ScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator
                  style={[tw`mb-2`, { width: "100%", minHeight: 44 }]}
                  contentContainerStyle={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 2,
                    paddingLeft: 2,
                    paddingRight: 24,
                    minHeight: 44,
                  }}
                  bounces={false}
                  overScrollMode="never"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                    const d = new Date();
                    d.setDate(d.getDate() + dayOffset);
                    const label =
                      dayOffset === 0
                        ? 'Today'
                        : dayOffset === 1
                          ? 'Tomorrow'
                          : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                    const isActive = selectedDate === dayOffset;
                    return (
                      <TouchableOpacity
                        key={dayOffset}
                        onPress={() => handleSelectedDateChange(dayOffset)}
                        style={[
                          {
                            flexShrink: 0,
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            borderRadius: 20,
                            backgroundColor: isActive ? BRAND_GREEN : "#F5F5F5",
                            marginRight: 8,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 13, color: isActive ? '#fff' : '#242E42' }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {/* Time: tap to open picker; picker closes on Done */}
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                  style={[
                    tw`flex-row items-center justify-between rounded-[10px] mb-2`,
                    { paddingVertical: 11, paddingHorizontal: 14, backgroundColor: '#F5F5F5' },
                  ]}
                >
                  <Text style={tw.style(`text-[15px] text-[#242E42]`, { fontFamily: 'RobotoMedium' })}>
                    {selectedTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </Text>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={BRAND_GREEN} />
                </TouchableOpacity>
                <Modal
                  visible={showTimePicker}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowTimePicker(false)}
                >
                  <Pressable
                    style={[tw`flex-1 justify-end bg-black/50`, { paddingBottom: Math.max(insets.bottom, 16) }]}
                    onPress={() => setShowTimePicker(false)}
                  >
                    <Pressable
                      style={tw`bg-white rounded-t-2xl pt-4 pb-8 px-4`}
                      onPress={(e) => {
              const ev = e as unknown as { stopPropagation?: () => void };
              ev.stopPropagation?.();
            }}
                    >
                      <View style={tw`flex-row items-center justify-between mb-2`}>
                        <Text style={tw.style(`text-lg text-[#242E42]`, { fontFamily: 'RobotoBold' })}>
                          Select time
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowTimePicker(false)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={[tw`py-2 px-3`, { backgroundColor: BRAND_GREEN, borderRadius: 8 }]}
                        >
                          <Text style={tw.style(`text-base text-white`, { fontFamily: 'RobotoBold' })}>
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <RNDateTimePicker
                        value={selectedTime}
                        mode="time"
                        display="spinner"
                        onChange={(_, date) => date != null && handleSelectedTimeChange(date, true)}
                        style={{ height: 120 }}
                      />
                    </Pressable>
                  </Pressable>
                </Modal>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator
                  style={{ width: "100%", minHeight: 44 }}
                  contentContainerStyle={{
                    marginBottom: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingLeft: 2,
                    paddingRight: 24,
                    minHeight: 44,
                  }}
                  bounces={false}
                  overScrollMode="never"
                >
                  {[
                    { label: 'Morning  6:30am', h: 6, m: 30 },
                    { label: 'Afternoon  3:00pm', h: 15, m: 0 },
                    { label: 'Evening  6:00pm', h: 18, m: 0 },
                  ].map((preset) => {
                    const isActive =
                      selectedTime.getHours() === preset.h && selectedTime.getMinutes() === preset.m;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        onPress={() => {
                          const d = new Date(selectedTime);
                          d.setHours(preset.h, preset.m, 0, 0);
                          handleSelectedTimeChange(d, true);
                        }}
                        style={[
                          {
                            flexShrink: 0,
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            borderRadius: 20,
                            backgroundColor: isActive ? BRAND_GREEN : BRAND_GREEN_SURFACE,
                            marginRight: 8,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            flexShrink: 0,
                            color: isActive ? "#fff" : BRAND_GREEN,
                          }}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

            </>
            ) : null}

            {/* Pickup Location Card - Same as Find a Ride */}
            {!(searchPinned && locationSearchField === "dropoff") ? (
            <View style={tw`bg-[#F5F5F5] rounded-[10px] p-2.5 mb-2`}>
              <View style={tw`flex-row justify-between items-center mb-1.5`}>
                <Text style={tw.style(`text-[11px] text-[#C8C7CC] uppercase`, { fontFamily: "RobotoRegular" })}>
                  Pickup
                </Text>
                {location != null && location.latitude !== 0 && location.longitude !== 0 && (
                  <TouchableOpacity
                    onPress={handleUseCurrentLocation}
                    style={tw`flex-row items-center gap-x-0.5 bg-base-green px-2 py-0.5 rounded-full`}
                  >
                    <MaterialCommunityIcons name="crosshairs-gps" size={10} color="white" />
                    <Text style={tw.style(`text-[9px] text-white`, { fontFamily: "RobotoMedium" })}>
                      Use Current
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={tw`pr-1.5`}>
                <CustomPlacesAutocomplete
                  placeholder="Enter pick up location"
                  initialValue={(() => {
                    const raw = state.pickup_location;
                    if (typeof raw !== 'string') return '';
                    if (raw.trim().toLowerCase() === 'location') {
                      return (location != null && location.latitude !== 0 && location.longitude !== 0) ? 'Current location' : '';
                    }
                    return formatAddressForDisplay(raw).full || raw;
                  })()}
                  userLat={location?.latitude != null && location?.longitude != null ? location.latitude : 6.3249}
                  userLng={location?.latitude != null && location?.longitude != null ? location.longitude : 8.1137}
                  showClearButton={false}
                  resultsMaxHeight={resultsMaxHeight}
                  onFocus={() => handleLocationSearchFocus("pickup")}
                  onBlur={handleLocationSearchBlur}
                  onPlaceSelected={(place) => {
                    Keyboard.dismiss();
                    setLocationSearchField(null);
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
                    if (location != null && location.latitude !== 0 && location.longitude !== 0) {
                      setPickupCoords({ lat: location.latitude, lng: location.longitude });
                      setState((prev) => ({ ...prev, pickup_location: "Current location" }));
                      reverseGeocode(location.latitude, location.longitude)
                        .then((res) => {
                          const address = res?.results?.[0]?.formatted_address;
                          if (address) {
                            setState((prev) => ({ ...prev, pickup_location: address }));
                          }
                        })
                        .catch(() => {});
                    } else {
                      setState((prev) => ({ ...prev, pickup_location: "" }));
                      setPickupCoords(null);
                    }
                  }}
                  styles={{
                    textInput: tw.style(`text-[13px] text-[#242E42]`, {
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
            ) : null}

            {/* Destination Location Card - Same as Find a Ride */}
            {!(searchPinned && locationSearchField === "pickup") ? (
            <View style={tw`bg-[#F5F5F5] rounded-[10px] p-2.5 mb-2`}>
              <Text style={tw.style(`text-[11px] text-[#C8C7CC] uppercase mb-1.5`, { fontFamily: "RobotoRegular" })}>
                Drop-off
              </Text>
              <View style={tw`pr-1.5`}>
                <CustomPlacesAutocomplete
                  placeholder="Enter drop-off location"
                  initialValue={formatAddressForDisplay(state.dropoff_location).full || state.dropoff_location}
                  userLat={location?.latitude != null && location?.longitude != null ? location.latitude : 6.3249}
                  userLng={location?.latitude != null && location?.longitude != null ? location.longitude : 8.1137}
                  showClearButton={false}
                  resultsMaxHeight={resultsMaxHeight}
                  onFocus={() => handleLocationSearchFocus("dropoff")}
                  onBlur={handleLocationSearchBlur}
                  onPlaceSelected={(place) => {
                    Keyboard.dismiss();
                    setLocationSearchField(null);
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
                    textInput: tw.style(`text-[13px] text-[#242E42]`, {
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
            ) : null}

            {!searchPinned ? (
            <>
            {/* Select Vehicle Type Section */}
            <Text style={tw.style(`text-[15px] text-[#242E42] mb-2`, { fontFamily: "RobotoBold" })}>
              Select Vehicle Type
            </Text>
            {vehicleTypesLoading ? (
              <View style={tw`items-center py-2.5 mb-2`}>
                <ActivityIndicator size="small" color={BRAND_GREEN} />
                <Text style={tw.style(`text-xs text-[#666] mt-1.5`, { fontFamily: "RobotoMedium" })}>
                  Loading vehicle types...
                </Text>
              </View>
            ) : vehicleTypes.length > 0 ? (
              <View
                style={{
                  width: vehicleGridLayout.rowW,
                  alignSelf: "stretch",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                {vehicleTypes.map((vehicle, index) => {
                  // Vehicle objects use vehicle_id field, not _id or id
                  const vehicleId = String(vehicle.vehicle_id || vehicle._id || vehicle.id || '');
                  const isSelected = String(state.vehicle_type_id) === vehicleId && vehicleId !== '' && vehicleId !== 'undefined';
                  const vehicleName = getVehicleDisplayName(vehicle);
                  // Ensure unique key by always including index to prevent duplicates
                  const uniqueKey = vehicleId && vehicleId !== 'undefined' ? `vehicle-${vehicleId}-${index}` : `vehicle-${index}-${vehicleName}`;
                  const { GAP, COLS } = vehicleGridLayout;
                  const marginRight = (index + 1) % COLS !== 0 ? GAP : 0;
                  const lastRowIndex = Math.floor((vehicleTypes.length - 1) / COLS);
                  const rowIndex = Math.floor(index / COLS);
                  const marginBottom = rowIndex < lastRowIndex ? GAP : 0;
                  return (
                    <TouchableOpacity
                      key={uniqueKey}
                      onPress={() => handleVehicleTypeSelect(vehicle)}
                      style={tw.style(
                        `bg-[#F5F5F5] rounded-[10px] p-2.5 items-center justify-center relative`,
                        isSelected && `bg-base-green/10 border-2 border-base-green`,
                        {
                          width: vehicleGridLayout.tileW,
                          minHeight: 72,
                          marginRight,
                          marginBottom,
                        }
                      )}
                    >
                      {getVehicleIcon(vehicleName)}
                      <Text
                        numberOfLines={2}
                        style={tw.style(
                          `text-xs mt-1 text-center px-0.5`,
                          { fontFamily: "RobotoBold" },
                          isSelected ? `text-base-green` : `text-[#242E42]`
                        )}
                      >
                        {vehicleName}
                      </Text>
                      {isSelected && (
                        <View style={tw`absolute top-0.5 right-0.5`}>
                          <MaterialCommunityIcons name="check-circle" size={16} color={BRAND_GREEN} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={tw`items-center py-2.5 mb-2`}>
                <Text style={tw.style(`text-xs text-[#666] mb-1.5`, { fontFamily: "RobotoMedium" })}>
                  {vehicleTypesError ?? "No vehicle types available"}
                </Text>
                <TouchableOpacity
                  onPress={fetchVehicleTypes}
                  style={[tw`px-3 py-1.5 rounded-lg`, { backgroundColor: BRAND_GREEN }]}
                >
                  <Text style={tw.style(`text-xs text-white`, { fontFamily: "RobotoBold" })}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Price summary - show as soon as the trip is fully selected */}
            {canShowFinanceSummary && fareSummary && (
              <View style={tw`bg-[#F5F5F5] rounded-[10px] p-2.5 mb-2`}>
                <View style={tw`flex-row items-center justify-between mb-1.5`}>
                  <Text style={tw.style(`text-[15px] text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                    Price Summary
                  </Text>
                  <Text style={tw.style(`text-[18px] text-base-green`, { fontFamily: "RobotoBold" })}>
                    ₦{fareSummary.totalFare.toLocaleString()}
                  </Text>
                </View>

                <View style={tw`gap-y-2`}>
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw.style(`text-sm text-[#666]`, { fontFamily: "RobotoRegular" })}>
                      Price
                    </Text>
                    <Text style={tw.style(`text-sm text-[#242E42]`, { fontFamily: "RobotoMedium" })}>
                      ₦{fareSummary.rideFare.toLocaleString()}
                    </Text>
                  </View>

                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw.style(`text-sm text-[#666]`, { fontFamily: "RobotoRegular" })}>
                      Service charge
                    </Text>
                    <Text style={tw.style(`text-sm text-[#242E42]`, { fontFamily: "RobotoMedium" })}>
                      ₦{fareSummary.serviceCharge.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={tw`mt-2 pt-2 border-t border-[#E3E3E3] flex-row items-center justify-between`}>
                  <Text style={tw.style(`text-[15px] text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                    Total estimate
                  </Text>
                  <Text style={tw.style(`text-[17px] text-base-green`, { fontFamily: "RobotoBold" })}>
                    ₦{fareSummary.totalFare.toLocaleString()}
                  </Text>
                </View>

                <Text style={tw.style(`text-[10px] text-[#999] mt-2`, { fontFamily: "RobotoRegular" })}>
                  Final total may adjust slightly based on route changes.
                </Text>
              </View>
            )}

            {/* Payment Type Selection */}
            <Text style={tw.style(`text-[15px] text-[#242E42] mb-2`, { fontFamily: "RobotoBold" })}>
              Payment Type
            </Text>
            <PaymentMethodSelector
              selected={state.payment_type}
              onSelect={(uiKey) =>
                setState((prev) => ({ ...prev, payment_type: uiKey }))
              }
              enabledMethods={enabledPaymentMethods}
              walletBalance={walletAvailableBalance}
              fareTotal={fareSummary?.totalFare}
              variant="cards"
            />
            </>
            ) : null}

          </ScrollView>

          {/* Schedule Ride button - fixed footer so always visible (not pushed below fare breakdown) */}
          {!searchPinned ? (
          <View
            style={[
              tw`px-0 bg-white`,
              {
                paddingTop: 6,
                paddingBottom: sheetFooterBottomPadding(insets.bottom),
                borderTopWidth: 1,
                borderTopColor: '#F0F0F0',
              },
            ]}
          >
            <Pressable
              onPress={handleSubmit}
              disabled={loading || !state.dropoff_location}
              style={tw.style(
                `py-3 rounded-[10px] items-center justify-center`,
                (loading || !state.dropoff_location) ? `opacity-50 bg-[#9E9E9E]` : `bg-base-green`
              )}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={tw.style(`text-base text-white`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Schedule Ride
                </Text>
              )}
            </Pressable>
          </View>
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
};

export default BookRideSheet;
