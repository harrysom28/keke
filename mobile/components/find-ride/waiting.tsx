import {
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Animated as RNAnimated,
} from "react-native";
import { AntDesign, Entypo, Ionicons } from "@expo/vector-icons";
import { Defs, Line, LinearGradient, Stop, Svg } from "react-native-svg";
import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { TouchableOpacity } from "react-native-gesture-handler";

import { TRide } from "@/types";
import tw from "@/lib/tailwind";
import { showMessage } from "react-native-flash-message";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import apiClient from "@/utils/apiClient";
import {
  getArrivingByLabel,
  getRideStateFromData,
  getRiderHeaderCopy,
  getTripContext,
} from "@/components/ride-in-transit/rideStates";
import { RideStatusHeader } from "@/components/ride-in-transit/RideStatusHeader";
import { TripDetailsCard } from "@/components/ride-in-transit/TripDetailsCard";
import { UserInfoCard } from "@/components/ride-in-transit/UserInfoCard";
import { ProgressBar } from "@/components/ride-in-transit/ProgressBar";
import { RiderActionButtons } from "@/components/ride-in-transit/ActionButtons";

const BRAND_GREEN = "#3C8F7C";
const ERROR_RED = "#EF4444";

const FALLBACK_ROTATING_MSG = ["Searching for drivers nearby…"];

function getSearchRotatingMessages(driversNotified: number, fareDisplay: string): string[] {
  const n = Math.max(0, Math.floor(driversNotified));
  return [
    n > 0
      ? `${n} driver${n !== 1 ? "s" : ""} notified`
      : "Searching for drivers nearby…",
    "Most rides match within 60 seconds",
    `Your fare is locked in at ${fareDisplay}`,
    "Expanding search if needed…",
    "Hang tight, almost there…",
  ];
}

// ─── Animated dots loader ─────────────────────────────────────────────────────
const AnimatedDots = () => {
  const dot1 = useRef(new RNAnimated.Value(0)).current;
  const dot2 = useRef(new RNAnimated.Value(0)).current;
  const dot3 = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const makeDot = (anim: RNAnimated.Value, delay: number) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(anim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          RNAnimated.timing(anim, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }),
          RNAnimated.delay(700),
        ])
      );

    const loops = [makeDot(dot1, 0), makeDot(dot2, 200), makeDot(dot3, 400)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: RNAnimated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -5],
        }),
      },
    ],
  });

  return (
    <View style={dotStyles.row}>
      {[dot1, dot2, dot3].map((anim, i) => (
        <RNAnimated.View key={i} style={[dotStyles.dot, dotStyle(anim)]} />
      ))}
    </View>
  );
};

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND_GREEN,
  },
});

// ─── Status header (searching state) ─────────────────────────────────────────
const StatusHeader = ({
  pulseAnim,
  subtitleOverride,
  isCountdown,
  rotatingMessages,
}: {
  pulseAnim: RNAnimated.Value;
  subtitleOverride?: string;
  isCountdown: boolean;
  rotatingMessages: readonly string[];
}) => {
  const [msgIndex, setMsgIndex] = useState(0);
  const fadeAnim = useRef(new RNAnimated.Value(1)).current;
  const messages =
    rotatingMessages.length > 0 ? rotatingMessages : FALLBACK_ROTATING_MSG;

  useEffect(() => {
    setMsgIndex(0);
  }, [rotatingMessages]);

  useEffect(() => {
    if (isCountdown || subtitleOverride) return;
    const len = Math.max(1, messages.length);

    const rotate = () => {
      RNAnimated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setMsgIndex((i) => (i + 1) % len);
        RNAnimated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    };

    const id = setInterval(rotate, 2800);
    return () => clearInterval(id);
  }, [isCountdown, subtitleOverride, fadeAnim, rotatingMessages, messages]);

  return (
    <View style={styles.statusHeader}>
      {/* Pulsing ring + spinner */}
      <RNAnimated.View
        style={[styles.loaderRing, { transform: [{ scale: pulseAnim }] }]}
      >
        <ActivityIndicator size="large" color={BRAND_GREEN} />
      </RNAnimated.View>

      <Text style={styles.statusTitle}>Finding your driver…</Text>

      {/* Keep this block height stable so the bottom sheet doesn't "bounce" when text changes */}
      <View style={styles.subtitleSlot}>
        {isCountdown && subtitleOverride ? (
          <View style={styles.countdownRow}>
            <ActivityIndicator size="small" color={BRAND_GREEN} />
            <Text style={styles.countdownText}>{subtitleOverride}</Text>
          </View>
        ) : (
          <RNAnimated.Text style={[styles.rotatingMsg, { opacity: fadeAnim }]}>
            {subtitleOverride ?? messages[msgIndex % messages.length]}
          </RNAnimated.Text>
        )}
      </View>

      <AnimatedDots />
    </View>
  );
};

// ─── Search info card ─────────────────────────────────────────────────────────
const RideSearchInfoCard = ({
  driversNearby,
  radiusKm,
  estWaitMin,
}: {
  driversNearby: number;
  radiusKm: number;
  estWaitMin: number;
}) => (
  <View style={styles.infoCard}>
    <View style={styles.infoItem}>
      <Ionicons name="time-outline" size={14} color={BRAND_GREEN} />
      <Text style={styles.infoLabel}>Est. wait</Text>
      <Text style={styles.infoValue}>~{estWaitMin} min</Text>
    </View>
    <View style={styles.infoDivider} />
    <View style={styles.infoItem}>
      <Ionicons name="radio-button-on-outline" size={14} color={BRAND_GREEN} />
      <Text style={styles.infoLabel}>Radius</Text>
      <Text style={styles.infoValue}>{radiusKm} km</Text>
    </View>
    <View style={styles.infoDivider} />
    <View style={styles.infoItem}>
      <Ionicons name="car-outline" size={14} color={BRAND_GREEN} />
      <Text style={styles.infoLabel}>Drivers</Text>
      <Text style={styles.infoValue}>
        {driversNearby} nearby
      </Text>
    </View>
  </View>
);

// ─── Progress steps ───────────────────────────────────────────────────────────
const STEPS = ["Searching drivers", "Notifying drivers", "Driver accepted"];

const ProgressSteps = ({
  currentStep,
}: {
  currentStep: number;
}) => (
  <View style={styles.stepsRow}>
    {STEPS.map((label, i) => {
      const done = i < currentStep;
      const active = i === currentStep;
      return (
        <View key={i} style={styles.stepItem}>
          <View
            style={[
              styles.stepDot,
              done && styles.stepDotDone,
              active && styles.stepDotActive,
            ]}
          >
            {done ? (
              <AntDesign name="check" size={10} color="#fff" />
            ) : (
              <Text
                style={[
                  styles.stepNum,
                  active && { color: "#fff" },
                ]}
              >
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            style={[
              styles.stepLabel,
              active && styles.stepLabelActive,
              done && styles.stepLabelDone,
            ]}
          >
            {label}
          </Text>
          {i < STEPS.length - 1 && (
            <View
              style={[styles.stepLine, (done || active) && styles.stepLineActive]}
            />
          )}
        </View>
      );
    })}
  </View>
);

// ─── Main interface ───────────────────────────────────────────────────────────
interface Props {
  action: () => void;
  info: (driver_id: string) => void;
  cancel: () => void;
  chat: () => void;
  ride: {} | TRide;
  waitingSubtitleOverride?: string;
  onRequestNewDriver?: () => void;
  onSearchAgain?: () => void;
  onTripResolved?: (rideId: string) => void;
  onDismissTripUI?: () => void;
}

export const WaitingView = ({
  action,
  info,
  cancel,
  ride,
  chat,
  waitingSubtitleOverride,
  onRequestNewDriver,
  onSearchAgain,
  onTripResolved,
  onDismissTripUI,
}: Props) => {
  const insets = useCombinedSafeInsets();
  const data = ride as TRide;

  const rideId = useMemo(() => {
    const r: any = data || {};
    return String(r?.ride_id || r?._id || "").trim();
  }, [data]);

  const [issuesOpen, setIssuesOpen] = useState(false);
  const [forceCompleting, setForceCompleting] = useState(false);

  const lastUpdatedMs = useMemo(() => {
    const r: any = data || {};
    const raw = r?.updatedAt || r?.updated_at || r?.last_updated || null;
    const t = raw ? new Date(raw).getTime() : NaN;
    if (Number.isFinite(t)) return t;
    const started = r?.started_at || r?.startedAt || null;
    const ts = started ? new Date(started).getTime() : NaN;
    return Number.isFinite(ts) ? ts : null;
  }, [data]);

  const noUpdateMinutes = useMemo(() => {
    if (!lastUpdatedMs) return null;
    return Math.floor((Date.now() - lastUpdatedMs) / 60000);
  }, [lastUpdatedMs]);

  const canDismissAfterNoUpdate = (noUpdateMinutes ?? 0) >= 15;

  const resolveTripAndNavigate = useMemo(() => {
    return (id: string) => {
      if (!id) return;
      if (onTripResolved) {
        onTripResolved(id);
        return;
      }
      try {
        router.push({ pathname: "/(app)/ride-details", params: { rideId: id } as any });
      } catch {
        // ignore
      }
    };
  }, [onTripResolved]);

  const doForceComplete = async (opts: { reportIssue: boolean }) => {
    if (!rideId) {
      showMessage({ type: "warning", message: "Ride ID not available yet." });
      return;
    }
    if (forceCompleting) return;
    setForceCompleting(true);
    try {
      const res = await apiClient.post(`rides/${rideId}/force-complete`, {
        reportIssue: opts.reportIssue,
      });
      const fare = (res as any)?.data?.fare ?? (res as any)?.fare ?? null;
      showMessage({
        type: "success",
        message: fare != null ? `Ride ended. Fare: ₦${Number(fare).toLocaleString()}` : "Ride ended successfully.",
      });
      resolveTripAndNavigate(rideId);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Unable to end ride. Please try again.";
      showMessage({ type: "danger", message: String(msg) });
    } finally {
      setForceCompleting(false);
    }
  };

  const hasDriver =
    data?.driver && typeof data.driver === "object"
      ? Object.keys(data.driver).length > 0
      : false;
  const isAccepted = data?.accepted_by_driver || data?.acceptedByDriver || false;
  const rideStatusLower = String((data as any)?.status ?? "").toLowerCase();
  const isDriverArrived =
    rideStatusLower === "arrived" || rideStatusLower === "driver_arrived";
  /** Trip is live on the road — prefer status when booleans are stale. */
  const hasRideStarted = !!(
    data?.is_ride_started ||
    data?.isRideStarted ||
    rideStatusLower === "in-progress" ||
    rideStatusLower === "in_progress" ||
    rideStatusLower === "started"
  );

  // ── Pulse animations ────────────────────────────────────────────────────────
  const searchPulseAnim = useRef(new RNAnimated.Value(1)).current;
  const arrivedPulseAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    if (isDriverArrived || hasRideStarted || isAccepted) {
      searchPulseAnim.setValue(1);
      return;
    }
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(searchPulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        RNAnimated.timing(searchPulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      searchPulseAnim.setValue(1);
    };
  }, [isDriverArrived, hasRideStarted, isAccepted, searchPulseAnim]);

  useEffect(() => {
    if (!isDriverArrived || hasRideStarted) {
      arrivedPulseAnim.setValue(1);
      return;
    }
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(arrivedPulseAnim, {
          toValue: 1.12,
          duration: 800,
          useNativeDriver: true,
        }),
        RNAnimated.timing(arrivedPulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      arrivedPulseAnim.setValue(1);
    };
  }, [isDriverArrived, hasRideStarted, arrivedPulseAnim]);

  // ── Progress step tracker ───────────────────────────────────────────────────
  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    if (isAccepted) {
      setProgressStep(2);
      return;
    }
    setProgressStep(0);
    const t = setTimeout(() => setProgressStep(1), 5000);
    return () => clearTimeout(t);
  }, [isAccepted]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const isCountdown = waitingSubtitleOverride?.includes("s)") ?? false;

  const formatCost = (cost: number | string | undefined) => {
    let costValue = cost;
    if (!costValue && data) {
      costValue =
        (data as any)?.fare?.totalFare ||
        (data as any)?.fare?.total_fare ||
        data?.cost ||
        (data as any)?.totalFare;
    }
    if (!costValue) return "₦0";
    const num = typeof costValue === "string" ? parseFloat(costValue) : costValue;
    if (isNaN(num) || num === 0) return "₦0";
    return `₦${Math.round(num).toLocaleString()}`;
  };

  const formatDistance = (distance: string | number | undefined) => {
    if (!distance) return "0 km";
    if (typeof distance === "number") {
      return distance >= 1000
        ? `${(distance / 1000).toFixed(1)} km`
        : `${Math.round(distance)} m`;
    }
    const str = String(distance).trim();
    if (str === "0" || str === "" || str === "0 km" || str === "0 m") return "0 km";
    if (str.includes("km") || str.includes("m")) return str;
    const num = parseFloat(str);
    if (!isNaN(num)) {
      return num >= 1000 ? `${(num / 1000).toFixed(1)} km` : `${Math.round(num)} m`;
    }
    return str;
  };

  const formatTime = (time: string | number | undefined) => {
    if (!time) return "0 min";
    if (typeof time === "number") {
      if (time === 0) return "0 min";
      if (time < 1) return "< 1 min";
      return `${Math.round(time)} min`;
    }
    const str = String(time).trim();
    if (str === "0" || str === "" || str === "0 min") return "0 min";
    if (str.includes("min")) return str;
    const num = parseFloat(str);
    if (!isNaN(num)) {
      if (num === 0) return "0 min";
      if (num < 1) return "< 1 min";
      return `${Math.round(num)} min`;
    }
    return str;
  };

  const driversNotified = useMemo(() => {
    const r = data as any;
    const v = r?.drivers_notified;
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === "string" && v.trim() !== "") {
      const p = parseInt(v, 10);
      if (!Number.isNaN(p)) return Math.max(0, p);
    }
    return 0;
  }, [data]);

  const searchRadiusKm = useMemo(() => {
    const v = (data as any)?.search_radius_km;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v * 10) / 10;
    return 10;
  }, [data]);

  const estWaitMin = useMemo(() => {
    const raw = (data as any)?.duration;
    const n = raw == null || raw === "" ? 2 : Number(raw);
    const base = Number.isFinite(n) && n > 0 ? Math.ceil(n) : Math.ceil(2);
    return Math.max(1, base);
  }, [data]);

  const searchFareDisplay = useMemo(() => {
    const costValue =
      (data as any)?.fare?.totalFare ??
      (data as any)?.fare?.total_fare ??
      data?.cost ??
      (data as any)?.totalFare;
    if (!costValue) return "₦0";
    const num = typeof costValue === "string" ? parseFloat(costValue) : costValue;
    if (isNaN(num) || num === 0) return "₦0";
    return `₦${Math.round(num).toLocaleString()}`;
  }, [data]);

  const searchRotatingMessages = useMemo(
    () => getSearchRotatingMessages(driversNotified, searchFareDisplay),
    [driversNotified, searchFareDisplay]
  );

  const statusText = useMemo(() => {
    if (hasRideStarted) return "In Transit";
    if (isAccepted) {
      const time = formatTime(data?.arrival_time);
      return time === "0 min" || time === "0" ? "Arriving now" : `Arriving in ${time}`;
    }
    return "Finding your driver…";
  }, [data?.arrival_time, hasRideStarted, isAccepted]);

  const statusSubtext = useMemo(() => {
    if (hasRideStarted) return "Your ride is in progress";
    if (isAccepted) {
      const distance = data?.arrival_distance
        ? formatDistance(data.arrival_distance)
        : data?.distance
        ? `${data.distance.toFixed(1)} km`
        : "0 km";
      return distance === "0 km" || distance === "0" ? "Driver is here" : `${distance} away`;
    }
    return waitingSubtitleOverride || "Searching for nearby drivers…";
  }, [data?.arrival_distance, data?.distance, hasRideStarted, isAccepted, waitingSubtitleOverride]);

  const liveRideState = useMemo(() => getRideStateFromData(data as any), [data]);
  const arrivingBy = useMemo(() => getArrivingByLabel(data as any), [data]);
  const tripContext = useMemo(() => getTripContext(data as any), [data]);
  const headerCopy = useMemo(
    () => getRiderHeaderCopy(liveRideState, data as any),
    [liveRideState, data]
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* ── Accepted / In-Transit (modernized) ── */}
          {isAccepted ? (
            <>
              <RideStatusHeader
                state={liveRideState}
                title={headerCopy.title}
                subtitle={headerCopy.subtitle}
                arrivingBy={arrivingBy}
                reassurance={headerCopy.reassurance}
              />

              <TripDetailsCard fromLabel={tripContext.fromLabel} toLabel={tripContext.toLabel} />

              {hasDriver ? (
                <UserInfoCard
                  title="Driver"
                  imageUrl={
                    (data as any)?.driver?.driver_image ||
                    (data as any)?.driver?.image ||
                    (data as any)?.driver?.user?.profileImage ||
                    (data as any)?.driver?.user?.image ||
                    null
                  }
                  name={(() => {
                    const d = (data as any)?.driver || {};
                    const u = d?.user || {};
                    const first =
                      d?.first_name ||
                      d?.firstname ||
                      u?.first_name ||
                      u?.firstname ||
                      u?.firstName ||
                      "";
                    const last =
                      d?.last_name ||
                      d?.lastname ||
                      u?.last_name ||
                      u?.lastname ||
                      u?.lastName ||
                      "";
                    const joined = [first, last].filter(Boolean).join(" ").trim();
                    return (
                      joined ||
                      d?.driver_name ||
                      d?.full_name ||
                      d?.name ||
                      u?.fullName ||
                      u?.name ||
                      "Driver"
                    );
                  })()}
                  ratingText={(() => {
                    const d = (data as any)?.driver || {};
                    const rating =
                      d?.driver_rating ??
                      d?.rating?.average ??
                      d?.rating ??
                      d?.user?.rating ??
                      null;
                    const trips = d?.rides_count ?? d?.total_rides ?? d?.driver_total_rides ?? null;
                    const ratingFixed =
                      rating != null && !Number.isNaN(parseFloat(String(rating)))
                        ? parseFloat(String(rating)).toFixed(1)
                        : null;
                    if (ratingFixed && trips != null) return `⭐ ${ratingFixed} (${trips} trips)`;
                    if (ratingFixed) return `⭐ ${ratingFixed}`;
                    if (trips != null) return `${trips} trips`;
                    return null;
                  })()}
                  subtitle={(() => {
                    const d = (data as any)?.driver || {};
                    const car =
                      [d?.vehicle_color, d?.vehicle_name, d?.vehicle_model]
                        .filter(Boolean)
                        .join(" ") ||
                      d?.vehicle_type ||
                      "";
                    const plate = d?.licence_plate_number || d?.vehicle_number || "";
                    const parts = [car, plate].filter(Boolean);
                    return parts.length ? parts.join(" • ") : null;
                  })()}
                />
              ) : null}

              <ProgressBar label="Pickup → Dropoff" state={liveRideState} />

              {(liveRideState === "trip_started" || liveRideState === "near_destination") ? (
                <View style={styles.issuesRow}>
                  <TouchableOpacity
                    onPress={() => setIssuesOpen(true)}
                    disabled={forceCompleting}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Having issues"
                  >
                    <Text style={styles.issuesLink}>Having issues?</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Modal
                visible={issuesOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIssuesOpen(false)}
              >
                <Pressable style={styles.sheetBackdrop} onPress={() => setIssuesOpen(false)} />
                <View style={styles.sheetWrap}>
                  <View style={styles.sheet}>
                    <Text style={styles.sheetTitle}>Having issues?</Text>
                    <Text style={styles.sheetSubtitle}>
                      You can end the ride if it’s stuck, or report that the driver didn’t end the trip.
                    </Text>

                    <TouchableOpacity
                      style={[styles.sheetAction, forceCompleting && { opacity: 0.6 }]}
                      disabled={forceCompleting}
                      onPress={() => {
                        setIssuesOpen(false);
                        Alert.alert("End Ride", "Are you sure you want to end this ride?", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "End Ride",
                            style: "destructive",
                            onPress: () => void doForceComplete({ reportIssue: false }),
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.sheetActionText}>End Ride</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sheetAction, forceCompleting && { opacity: 0.6 }]}
                      disabled={forceCompleting}
                      onPress={() => {
                        setIssuesOpen(false);
                        Alert.alert(
                          "Report issue",
                          "This will end the ride and notify support that the driver didn’t end the trip.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Report & End",
                              style: "destructive",
                              onPress: () => void doForceComplete({ reportIssue: true }),
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={[styles.sheetActionText, { color: ERROR_RED }]}>
                        Report: Driver Didn’t End Trip
                      </Text>
                    </TouchableOpacity>

                    {canDismissAfterNoUpdate ? (
                      <TouchableOpacity
                        style={styles.sheetAction}
                        onPress={() => {
                          setIssuesOpen(false);
                          Alert.alert(
                            "Dismiss trip card?",
                            "This will only dismiss the trip UI on your device. It will not complete the trip.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Dismiss",
                                style: "destructive",
                                onPress: () => {
                                  try {
                                    onDismissTripUI?.();
                                  } catch {
                                    // ignore
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.sheetActionText}>Dismiss</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.sheetCancel}
                      onPress={() => setIssuesOpen(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.sheetCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              <RiderActionButtons
                state={liveRideState}
                onChat={() => {
                  try {
                    chat();
                  } catch {
                    showMessage({ type: "warning", message: "Chat is not available right now." });
                  }
                }}
                onCall={() => {
                  const driver = (data as any)?.driver || {};
                  const phone =
                    driver?.driver_phone ||
                    driver?.phone ||
                    driver?.phone_number ||
                    driver?.user?.phone ||
                    driver?.user?.phoneNumber ||
                    (data as any)?.driver_phone ||
                    "";
                  if (!phone) {
                    showMessage({ type: "warning", message: "Driver phone number not available" });
                    return;
                  }
                  Linking.openURL(`tel:${String(phone).trim()}`).catch(() =>
                    showMessage({
                      type: "danger",
                      message: "Unable to make call. Please try again.",
                    })
                  );
                }}
                onCancel={cancel}
                onEmergency={() => {
                  const rideId = (data as any)?.ride_id || (data as any)?._id || "";
                  try {
                    router.push({
                      pathname: "/(app)/(tabs)/(profile)/contact",
                      params: {
                        ...(rideId ? { rideId } : {}),
                        subject: "Emergency / safety issue",
                      } as any,
                    });
                  } catch {
                    showMessage({ type: "warning", message: "Unable to open support right now." });
                  }
                }}
              />
            </>
          ) : null}

        {/* ── Driver arrived at pickup ── */}
        {!isAccepted && isDriverArrived && !hasRideStarted ? (
          <View style={styles.statusHeader}>
            <View style={tw`w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-2`}>
              <RNAnimated.View
                style={[
                  tw`w-10 h-10 rounded-full bg-base-green`,
                  { transform: [{ scale: arrivedPulseAnim }] },
                ]}
              />
            </View>
            <Text style={styles.statusTitle}>Your driver is outside</Text>
            <Text
              style={tw.style(`text-sm text-[#8F92A1] text-center mt-1 px-2`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {`${
                (data as any)?.driver?.driver_name ??
                (data as any)?.driver?.name ??
                "Driver"
              } is waiting for you`}
            </Text>
            <View
              style={tw`bg-[#F8F8F8] rounded-full px-4 py-2 flex-row items-center gap-x-2 mt-3`}
            >
              <Text
                style={tw.style(`text-sm text-black`, { fontFamily: "RobotoMedium" })}
              >
                {[
                  (data as any)?.driver?.vehicle_color,
                  (data as any)?.driver?.vehicle_name,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || "Keke"}
              </Text>
              <View style={tw`w-1 h-1 rounded-full bg-[#8F92A1]`} />
              <Text
                style={tw.style(`text-sm text-[#8F92A1]`, { fontFamily: "RobotoMedium" })}
              >
                {(data as any)?.driver?.licence_plate_number ?? ""}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Searching / accepted / in-transit ── */
          <>
            {!isAccepted && !hasRideStarted ? (
              /* ── WAITING STATE: upgraded UI ── */
              <>
                <StatusHeader
                  pulseAnim={searchPulseAnim}
                  subtitleOverride={waitingSubtitleOverride}
                  isCountdown={isCountdown}
                  rotatingMessages={searchRotatingMessages}
                />

                <RideSearchInfoCard
                  driversNearby={driversNotified}
                  radiusKm={searchRadiusKm}
                  estWaitMin={estWaitMin}
                />

                <ProgressSteps currentStep={progressStep} />
              </>
            ) : (
              /* ── Accepted / In-Transit header ── */
              // handled above (modernized accepted view)
              <View />
            )}
          </>
        )}

        {/* ── Legacy driver card (keep only for non-accepted states) ── */}
        {hasDriver && !isAccepted && (
          <TouchableOpacity
            onPress={() => info(data?.driver?.driver_id)}
            style={styles.driverCard}
            activeOpacity={0.8}
          >
            <View style={styles.driverInfo}>
              <View style={styles.avatarContainer}>
                {data?.driver?.driver_image ||
                data?.driver?.image ||
                (data?.driver as any)?.user?.profileImage ||
                (data?.driver as any)?.user?.image ? (
                  <Image
                    source={{
                      uri:
                        data.driver.driver_image ||
                        data.driver.image ||
                        (data.driver as any)?.user?.profileImage ||
                        (data.driver as any)?.user?.image,
                    }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <AntDesign name="user" size={28} color="#999" />
                  </View>
                )}
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>
                  {data?.driver?.driver_name ||
                    data?.driver?.name ||
                    (data?.driver as any)?.user?.name ||
                    (data?.driver as any)?.user?.fullName ||
                    "Driver"}
                </Text>
                <View style={styles.driverMeta}>
                  <View style={styles.ratingRow}>
                    <AntDesign name="star" size={12} color="#FBC02D" />
                    <Text style={styles.ratingText}>
                      {(() => {
                        const driver = data?.driver as any;
                        if (driver?.driver_rating && driver.driver_rating > 0)
                          return typeof driver.driver_rating === "number"
                            ? driver.driver_rating.toFixed(1)
                            : parseFloat(String(driver.driver_rating)).toFixed(1);
                        if (driver?.rating?.average && driver.rating.average > 0)
                          return typeof driver.rating.average === "number"
                            ? driver.rating.average.toFixed(1)
                            : parseFloat(String(driver.rating.average)).toFixed(1);
                        if (driver?.rating && typeof driver.rating === "number" && driver.rating > 0)
                          return driver.rating.toFixed(1);
                        if (driver?.user?.rating && driver.user.rating > 0)
                          return typeof driver.user.rating === "number"
                            ? driver.user.rating.toFixed(1)
                            : parseFloat(String(driver.user.rating)).toFixed(1);
                        return "4.5";
                      })()}
                    </Text>
                    <Text style={styles.reviewCount}>
                      {(() => {
                        const driver = data?.driver as any;
                        if (driver?.driver_review_count && driver.driver_review_count > 0)
                          return `(${driver.driver_review_count} ${
                            driver.driver_review_count === 1 ? "review" : "reviews"
                          })`;
                        if (driver?.rating?.count && driver.rating.count > 0)
                          return `(${driver.rating.count} ${
                            driver.rating.count === 1 ? "review" : "reviews"
                          })`;
                        return "(New driver)";
                      })()}
                    </Text>
                  </View>
                  {(() => {
                    const distance = data?.arrival_distance
                      ? formatDistance(data.arrival_distance)
                      : data?.distance
                      ? `${data.distance.toFixed(1)} km`
                      : null;
                    const time = data?.arrival_time
                      ? formatTime(data.arrival_time)
                      : data?.duration
                      ? `${Math.round(data.duration)} min`
                      : null;
                    if (distance && time && distance !== "0 km" && time !== "0 min") {
                      return (
                        <View style={styles.distanceRow}>
                          <Entypo name="location-pin" size={11} color="#666" />
                          <Text style={styles.distanceText}>
                            {distance} • {time}
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                </View>
              </View>
            </View>
            {(data?.driver?.vehicle_image ||
              (data?.driver as any)?.vehicleImages?.[0]?.url) && (
              <Image
                source={{
                  uri:
                    data.driver.vehicle_image ||
                    (data.driver as any)?.vehicleImages?.[0]?.url,
                }}
                style={styles.vehicleImage}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
        )}

        {/* ── Secure fare banner (accepted, en-route) ── */}
        {!isAccepted ? null : !hasRideStarted ? (
          <View style={styles.secureFareBanner}>
            <View style={styles.secureFareHeader}>
              <Ionicons name="lock-closed" size={18} color={BRAND_GREEN} />
              <View style={tw`flex-1`}>
                <Text style={styles.secureFareTitle}>Your fare is secured</Text>
                <Text style={styles.secureFareText}>
                  {formatCost(data?.cost)} is held in your wallet. Do not pay cash or
                  renegotiate with your driver.
                </Text>
              </View>
            </View>
            <View style={styles.secureFareFooter}>
              <Text style={styles.secureFareSmall}>Pressured to pay differently?</Text>
              <TouchableOpacity
                onPress={() => {
                  const rideId = (data as any)?.ride_id || (data as any)?._id || "";
                  router.push({
                    pathname: "/(app)/(tabs)/(profile)/contact",
                    params: {
                      ...(rideId ? { rideId } : {}),
                      subject: "Driver requested off-app payment",
                    } as any,
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.secureFareLink}>Report it →</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── Fare card ── */}
        <View style={styles.tripCard}>
          <View style={styles.costRow}>
            <View>
              <Text style={styles.costLabel}>Estimated Fare</Text>
              <Text style={styles.costValue}>{formatCost(data?.cost)}</Text>
            </View>
            {(data?.vehicle_type ||
              data?.vehicleType?.name ||
              data?.vehicleType?.displayName ||
              (data as any)?.vehicleType) && (
              <View style={styles.vehicleTypePill}>
                <Ionicons name="car-outline" size={13} color={BRAND_GREEN} />
                <Text style={styles.vehicleTypeText}>
                  {data?.vehicle_type ||
                    data?.vehicleType?.displayName ||
                    data?.vehicleType?.name ||
                    (data as any)?.vehicleType ||
                    "Vehicle"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Progress bar (ride started) ── */}
        {hasRideStarted && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
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
                    <Stop stopColor={BRAND_GREEN} />
                    <Stop offset={1} stopOpacity={0.2} />
                  </LinearGradient>
                </Defs>
              </Svg>
            </View>
          </View>
        )}

        {/* ── Action buttons (waiting-state only; accepted handled above) ── */}
        {!isAccepted ? (
          <View style={[styles.actionButtons, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
            <TouchableOpacity
              onPress={onRequestNewDriver ?? action}
              style={styles.primaryButton}
              activeOpacity={0.8}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.primaryButtonText}>Try another driver</Text>
            </TouchableOpacity>

            {onSearchAgain && (
              <TouchableOpacity onPress={onSearchAgain} style={styles.textButton} activeOpacity={0.7}>
                <Ionicons
                  name="location-outline"
                  size={15}
                  color={BRAND_GREEN}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.textButtonText}>Change pickup</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={cancel} style={styles.cancelButton} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancel ride</Text>
            </TouchableOpacity>

            <Text style={styles.reassuranceText}>Most rides are matched within 60 seconds</Text>
          </View>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    backgroundColor: "#fff",
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  keyboardContainer: {
    width: "100%",
    flex: 1,
    minHeight: 0,
  },
  scrollContainer: {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    // Trip in progress: ensure fare card/action area isn't clipped on small screens.
    paddingBottom: 72,
    width: "100%",
  },

  issuesRow: {
    marginTop: 8,
    marginBottom: 6,
    alignItems: "center",
  },
  issuesLink: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoMedium",
    textDecorationLine: "underline",
  },
  sheetBackdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    color: "#111827",
    fontFamily: "RobotoBold",
  },
  sheetSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
    lineHeight: 16,
  },
  sheetAction: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
  },
  sheetActionText: {
    fontSize: 14,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  sheetCancel: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  sheetCancelText: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: "RobotoMedium",
  },

  // ── Status header ───────────────────────────────────────────────────────────
  statusHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  loaderRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E8F5F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    marginBottom: 4,
    textAlign: "center",
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  subtitleSlot: {
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownText: {
    fontSize: 13,
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
  },
  rotatingMsg: {
    fontSize: 13,
    lineHeight: 18,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    textAlign: "center",
    marginTop: 2,
  },
  checkIconContainer: {
    marginBottom: 6,
  },
  statusSubtext: {
    fontSize: 13,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    textAlign: "center",
    marginTop: 2,
  },

  // ── Search info card ────────────────────────────────────────────────────────
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F4FBF9",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#D3EDE8",
  },
  infoItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  infoLabel: {
    fontSize: 10,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    marginTop: 2,
  },
  infoValue: {
    fontSize: 12,
    color: "#1A1A1A",
    fontFamily: "RobotoMedium",
    fontWeight: "600",
  },
  infoDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#D3EDE8",
  },

  // ── Progress steps ──────────────────────────────────────────────────────────
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    zIndex: 1,
  },
  stepDotActive: {
    backgroundColor: BRAND_GREEN,
  },
  stepDotDone: {
    backgroundColor: BRAND_GREEN,
  },
  stepNum: {
    fontSize: 11,
    color: "#8F92A1",
    fontFamily: "RobotoMedium",
  },
  stepLabel: {
    fontSize: 10,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    textAlign: "center",
  },
  stepLabelActive: {
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
  },
  stepLabelDone: {
    color: "#1A1A1A",
    fontFamily: "RobotoMedium",
  },
  stepLine: {
    position: "absolute",
    top: 11,
    left: "50%",
    right: "-50%",
    height: 2,
    backgroundColor: "#E5E7EB",
    zIndex: 0,
  },
  stepLineActive: {
    backgroundColor: BRAND_GREEN,
  },

  // ── Driver card ─────────────────────────────────────────────────────────────
  driverCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  driverInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    marginBottom: 3,
  },
  driverMeta: {
    gap: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: "#1A1A1A",
    fontFamily: "RobotoMedium",
    marginLeft: 2,
  },
  reviewCount: {
    fontSize: 11,
    color: "#999",
    fontFamily: "RobotoRegular",
    marginLeft: 3,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distanceText: {
    fontSize: 11,
    color: "#666",
    fontFamily: "RobotoRegular",
  },
  vehicleImage: {
    width: 56,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#F9F9F9",
    marginLeft: 6,
  },

  // ── Secure fare banner ──────────────────────────────────────────────────────
  secureFareBanner: {
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: BRAND_GREEN,
  },
  secureFareHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  secureFareTitle: {
    fontSize: 13,
    fontFamily: "RobotoBold",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  secureFareText: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#666",
    lineHeight: 16,
  },
  secureFareFooter: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  secureFareSmall: {
    fontSize: 11,
    fontFamily: "RobotoRegular",
    color: "#8E8E93",
  },
  secureFareLink: {
    fontSize: 11,
    fontFamily: "RobotoMedium",
    color: BRAND_GREEN,
  },

  // ── Fare card ───────────────────────────────────────────────────────────────
  tripCard: {
    backgroundColor: "#F4FBF9",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D3EDE8",
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costLabel: {
    fontSize: 11,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    marginBottom: 2,
  },
  costValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    letterSpacing: 0.3,
  },
  vehicleTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5F2",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#D3EDE8",
  },
  vehicleTypeText: {
    fontSize: 12,
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
  },

  // ── Progress bar (in-transit) ───────────────────────────────────────────────
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    width: "100%",
  },

  // ── Action buttons ──────────────────────────────────────────────────────────
  actionButtons: {
    gap: 10,
    marginTop: 4,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 4,
  },
  quickActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: BRAND_GREEN,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F9F4",
  },
  primaryButton: {
    backgroundColor: BRAND_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "RobotoBold",
  },
  textButton: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 8,
  },
  textButtonText: {
    fontSize: 14,
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
    fontWeight: "600",
  },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: ERROR_RED,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: "#FFF5F5",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: ERROR_RED,
    fontFamily: "RobotoBold",
  },
  reassuranceText: {
    fontSize: 12,
    color: "#8F92A1",
    fontFamily: "RobotoRegular",
    textAlign: "center",
    marginTop: 2,
  },
});
