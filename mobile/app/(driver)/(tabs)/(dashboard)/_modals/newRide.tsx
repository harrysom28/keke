import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  DRIVER_ACCEPT_RIDE,
  DRIVER_COMPLETE_RIDE,
  DRIVER_MARK_PICKUP_ARRIVED,
  DRIVER_PAY_CHANGE,
  DRIVER_REJECT_RIDE,
  DRIVER_START_RIDE,
} from "@/constants";
import React, {
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppContext } from "@/app/context";
import DriverChatModal from "@/shared/modal/driverChat";
import RequestChangeModal from "./new-ride/payChangeSheet";
import { TDriverActiveRide } from "@/types";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getArrivingByLabel,
  getDriverHeaderCopy,
  getRideStateFromData,
  getTripContext,
} from "@/components/ride-in-transit/rideStates";
import {
  driverOfferPaymentApiKey,
  driverOfferPaymentUiKey,
} from "@/utils/paymentMethods";
import { RideStatusHeader } from "@/components/ride-in-transit/RideStatusHeader";
import { TripDetailsCard } from "@/components/ride-in-transit/TripDetailsCard";
import { UserInfoCard } from "@/components/ride-in-transit/UserInfoCard";
import { ProgressBar } from "@/components/ride-in-transit/ProgressBar";
import { DriverActionButtons } from "@/components/ride-in-transit/ActionButtons";
import { useDevvieSheetHeight } from "@/hooks/useDevvieSheetHeight";

const OFFER_ACTION_HIT_SLOP = { top: 15, bottom: 15, left: 15, right: 15 } as const;

const sheetActionFooter = {
  width: "100%" as const,
  backgroundColor: "#fff",
  borderTopWidth: 1,
  borderTopColor: "#E5E7EB",
  paddingTop: 8,
  paddingHorizontal: 16,
};

const handleRideApiError = (err: unknown) => {
  showMessage({
    type: "danger",
    message: getErrorMessage(err, "An error occurred. Please try again."),
  });
};

interface Props {
  bottomSheetRef: RefObject<BottomSheetMethods>;
  data: Partial<TDriverActiveRide>;
  getActiveRide: () => void;
  /** ETA/distance from live route (driver → pickup or → dropoff). */
  routeEta?: string;
  routeDistance?: string;
  /** Increment to open the chat modal (notification deep link). */
  chatOpenSignal?: number;
  /** Clear “new offer” tab badge after accept/reject. */
  onOfferResolved?: () => void;
  /** Clear offer UI immediately after decline (do not refetch active ride). */
  onDeclineOffer?: (rideId: string) => void;
  /** Wall-clock ms when the sequential offer expires (Bolt-style window). */
  offerDeadlineMs?: number | null;
  onOfferExpired?: () => void;
  /** Fired when the driver completes the trip, so the host can show the
   * Trip Completed / Confirm Payment modal (which outlives this sheet). */
  onTripCompleted?: (snapshot: {
    rideId: string;
    cost: string;
    paymentType: string;
    passengerName: string;
  }) => void;
}

const NewRide = ({
  bottomSheetRef,
  data,
  getActiveRide,
  routeEta = "",
  routeDistance = "",
  chatOpenSignal = 0,
  onOfferResolved,
  onDeclineOffer,
  offerDeadlineMs = null,
  onOfferExpired,
  onTripCompleted,
}: Props) => {
  const { apiConfig } = useContext(AppContext);
  const insets = useSafeAreaInsets();
  const { sheetHeight, maxBodyHeight, onBodyLayout } = useDevvieSheetHeight();
  const footerBottomPad = insets.bottom + 12;
  const [loading, setLoading] = useState({
    accept: false,
    start: false,
    arrived: false,
    reject: false,
    complete: false,
    confirm: false,
    change: false,
  });
  const hasRideStarted = data?.is_ride_started;
  const accepted = !!data?.accepted_by_driver;
  const statusLower = String(data?.status ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "");
  const atPickup =
    accepted &&
    !hasRideStarted &&
    (statusLower === "arrived" || statusLower === "driverarrived");
  const headingToPickup =
    accepted && !hasRideStarted && !atPickup;
  const lastChatKickRef = useRef(0);
  const [show, setShow] = useState<boolean>(false);
  const [chatModal, setChatModal] = useState<boolean>(false);
  const rideId = String(
    data?.ride_id ??
      (data as unknown as { rideId?: string })?.rideId ??
      (data as { _id?: string })?._id ??
      ""
  ).trim();
  const hasValidRideId = /^[a-f\d]{24}$/i.test(rideId);
  const guardRideId = () => {
    if (!hasValidRideId) {
      showMessage({
        type: "danger",
        message:
          "This ride is missing a valid reference. Pull to refresh or reopen the trip from the map.",
      });
      return false;
    }
    return true;
  };
  const paymentUiLabel = driverOfferPaymentUiKey(
    data as { payment_type?: unknown; payment_method?: unknown }
  );
  const payment_type = driverOfferPaymentApiKey(
    data as { payment_type?: unknown; payment_method?: unknown }
  );
  const offerExpiredFiredRef = useRef(false);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState<number | null>(null);

  const passengerName =
    data?.passenger?.passenger_name ??
    (data?.passenger as { name?: string } | undefined)?.name ??
    "Passenger";
  const passengerImage =
    data?.passenger?.passenger_image ??
    (data?.passenger as { image?: string } | undefined)?.image;
  const fareDisplay =
    data?.cost ??
    ((data as unknown as { fare?: unknown })?.fare != null
      ? String(Math.round(Number((data as unknown as { fare?: unknown })?.fare)))
      : "");

  useEffect(() => {
    offerExpiredFiredRef.current = false;
    if (!offerDeadlineMs) {
      setOfferSecondsLeft(null);
      return;
    }
    const tick = () => {
      const s = Math.max(0, Math.ceil((offerDeadlineMs - Date.now()) / 1000));
      setOfferSecondsLeft(s);
      if (s === 0 && !offerExpiredFiredRef.current) {
        offerExpiredFiredRef.current = true;
        onOfferExpired?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offerDeadlineMs, onOfferExpired]);

  const handleBack = () => {
    bottomSheetRef?.current?.close();
  };

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

      return () => {
        backHandler.remove();
      };
    }, [])
  );

  useEffect(() => {
    if (!chatOpenSignal || chatOpenSignal === lastChatKickRef.current) return;
    lastChatKickRef.current = chatOpenSignal;
    setChatModal(true);
  }, [chatOpenSignal]);

  const arrivalTimeLabel = routeEta || data?.arrival_time || "";
  const arrivalDistLabel = routeDistance || data?.arrival_distance || "";

  /**
   * Best-effort distance-to-dropoff in meters, parsed from the live route distance string
   * (e.g. "2.5 km", "850 m"). Only meaningful while the trip is underway because that's
   * when `routeDistance` represents driver → dropoff.
   */
  const distanceToDropoff = useMemo<number | null>(() => {
    const raw = String(routeDistance || "").trim();
    if (!raw) return null;
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    const lower = raw.toLowerCase();
    if (lower.includes("km")) return Math.round(num * 1000);
    if (lower.includes("m")) return Math.round(num);
    return null;
  }, [routeDistance]);

  const liveRideState = getRideStateFromData({
    ...(data as any),
    routeEta,
  });
  const driverCopy = accepted
    ? getDriverHeaderCopy(liveRideState)
    : {
        title: "New ride request",
        subtitle: "Review the trip and accept or decline",
      };
  const arrivingBy = getArrivingByLabel({ ...(data as any), routeEta });
  const tripContext = getTripContext(data as any);

  const inTripProgress =
    liveRideState === "trip_started" || liveRideState === "near_destination";

  const openNavigation = async () => {
    const toPickup = liveRideState === "heading_to_pickup";
    const dest = toPickup
      ? (data as any)?.origin
      : (data as any)?.dropoffLocation || (data as any)?.destination;

    const lat =
      dest?.coordinates?.[1] ??
      dest?.lat ??
      dest?.latitude ??
      dest?.location?.lat ??
      dest?.geometry?.location?.lat;
    const lng =
      dest?.coordinates?.[0] ??
      dest?.long ??
      dest?.lng ??
      dest?.longitude ??
      dest?.location?.lng ??
      dest?.location?.long ??
      dest?.geometry?.location?.lng;

    const nLat = lat != null ? parseFloat(String(lat)) : NaN;
    const nLng = lng != null ? parseFloat(String(lng)) : NaN;
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
      showMessage({ type: "warning", message: "Unable to open navigation — location is missing." });
      return;
    }

    // Try Google Maps first, fall back to Apple Maps, then the Google Maps web URL
    const googleUrl = `google.navigation:q=${nLat},${nLng}`;
    const appleMapsUrl = `maps://maps.apple.com/?daddr=${nLat},${nLng}&dirflg=d`;
    const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${nLat},${nLng}&travelmode=driving`;

    try {
      const canOpenGoogle = await Linking.canOpenURL(googleUrl);
      if (canOpenGoogle) {
        await Linking.openURL(googleUrl);
        return;
      }
      const canOpenApple = await Linking.canOpenURL(appleMapsUrl);
      if (canOpenApple) {
        await Linking.openURL(appleMapsUrl);
        return;
      }
      await Linking.openURL(googleWebUrl);
    } catch {
      showMessage({ type: "warning", message: "Unable to open navigation." });
    }
  };

  const AcceptRide = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, accept: true }));
    const offerId = String((data as { offer_id?: string })?.offer_id || "").trim();
    axios
      .post(DRIVER_ACCEPT_RIDE, offerId ? { rideId, offerId } : { rideId }, apiConfig)
      .then(({ data }) => {
        onOfferResolved?.();
        getActiveRide();
        showMessage({ type: "success", message: data?.message });
      })
      .catch((err: unknown) => {
        const status = (err as any)?.response?.status;
        if (status === 403) {
          // Middleware blocked the request — surface the server reason clearly.
          const serverMsg: string = (err as any)?.response?.data?.message ?? "";
          const isKyc =
            serverMsg.toLowerCase().includes("kyc") ||
            serverMsg.toLowerCase().includes("verification") ||
            serverMsg.toLowerCase().includes("onboarding");
          showMessage({
            type: "warning",
            message: isKyc
              ? "Your account isn't cleared to accept rides yet. Contact support if you believe this is a mistake."
              : serverMsg || "You are not authorized to accept this ride.",
            duration: 5000,
          });
        } else if (status === 404) {
          showMessage({ type: "info", message: "This ride is no longer available." });
          onOfferResolved?.();
        } else if (status === 409) {
          // Expired offer, already taken, or duplicate accept — all safe to dismiss silently.
          showMessage({
            type: "info",
            message:
              (err as any)?.response?.data?.message === "Offer expired"
                ? "This offer has expired."
                : "This ride was already accepted by another driver.",
          });
          onOfferResolved?.();
        } else {
          handleRideApiError(err);
        }
      })
      .finally(() => setLoading((prev) => ({ ...prev, accept: false })));
  };
  const RejectRide = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, reject: true }));
    axios
      .post(DRIVER_REJECT_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        onOfferResolved?.();
        onDeclineOffer?.(rideId);
        showMessage({ type: "success", message: data?.message });
      })
      .catch((err: unknown) => {
        const msg = getErrorMessage(err, "");
        if (/no pending offer/i.test(msg)) {
          onOfferResolved?.();
          onDeclineOffer?.(rideId);
        } else {
          handleRideApiError(err);
        }
      })
      .finally(() => setLoading((prev) => ({ ...prev, reject: false })));
  };
  const MarkPickupArrived = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, arrived: true }));
    axios
      .post(DRIVER_MARK_PICKUP_ARRIVED, { rideId }, apiConfig)
      .then(({ data }) => {
        getActiveRide();
        showMessage({ type: "success", message: data?.message });
      })
      .catch((error: any) => {
        const status = error?.response?.status;
        if (status === 403) {
          const distance = error?.response?.data?.distance_meters;
          Alert.alert(
            "Not at Pickup Location",
            distance != null
              ? `You are ${distance}m away. Please drive to the pickup point first.`
              : "Please drive to the pickup point first.",
            [{ text: "OK" }]
          );
          return;
        }
        if (status === 409) {
          // Already marked — refresh ride state silently
          getActiveRide();
          return;
        }
        handleRideApiError(error);
      })
      .finally(() => setLoading((prev) => ({ ...prev, arrived: false })));
  };

  const StartRide = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, start: true }));
    axios
      .post(DRIVER_START_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        getActiveRide();
        showMessage({ type: "success", message: data?.message });
      })
      .catch(handleRideApiError)
      .finally(() => setLoading((prev) => ({ ...prev, start: false })));
  };
  const CompleteRide = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, complete: true }));
    axios
      .post(DRIVER_COMPLETE_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        // Hand off to the layout-level Trip Completed / Confirm Payment modal,
        // which survives this sheet being closed when the ride goes terminal.
        onTripCompleted?.({
          rideId,
          cost: String(fareDisplay ?? ""),
          paymentType: payment_type,
          passengerName,
        });
        handleBack();
        showMessage({ type: "success", message: data?.message });
        getActiveRide();
      })
      .catch((err: any) => {
        const msg: string =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "";
        if (/from the destination/i.test(msg)) {
          Alert.alert("Too far from destination", msg, [{ text: "OK" }]);
          return;
        }
        handleRideApiError(err);
      })
      .finally(() => setLoading((prev) => ({ ...prev, complete: false })));
  };
  const PayChange = (amount: string) => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, change: true }));
    axios
      .post(DRIVER_PAY_CHANGE, { rideId, amount }, apiConfig)
      .then(({ data }) => {
        showMessage({ type: "success", message: data?.message });
        setShow(false);
      })
      .catch((err) => {
        if ((err as { response?: { status?: number } })?.response?.status === 404) {
          return;
        }
        handleRideApiError(err);
      })
      .finally(() => setLoading((prev) => ({ ...prev, change: false })));
  };

  return (
    <BottomSheet
      height={sheetHeight}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      disableBodyPanning={true}
      closeOnDragDown={true}
      style={tw.style(`px-6 py-2 rounded-t-[40px]`, {
        backgroundColor: "#fff",
        zIndex: 999,
        ...(Platform.OS === "android" ? { elevation: 12 } : {}),
      })}
    >
      <DriverChatModal
        data={{
          id: (data?.passenger?.passenger_id ||
            (data?.passenger as { user_id?: string } | undefined)?.user_id ||
            "") as string,
          rideId: (data?.ride_id ?? (data as unknown as { rideId?: string })?.rideId) as string,
          name: passengerName,
          image: (passengerImage || "") as string,
        }}
        visible={chatModal}
        onClose={() => setChatModal(false)}
      />
      <RequestChangeModal
        show={show}
        onClose={() => setShow(false)}
        handlePay={(amount) => PayChange(amount)}
        data={data}
        loading={loading.change}
      />
      <View
        onLayout={onBodyLayout}
        style={{
          maxHeight: maxBodyHeight,
          width: "100%",
          flexDirection: "column",
          backgroundColor: "#fff",
        }}
      >
        <ScrollView
          pointerEvents="auto"
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          style={{ flexGrow: 0, flexShrink: 1, backgroundColor: "#fff" }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 0,
            paddingBottom: 16,
            paddingHorizontal: 16,
            gap: 8,
          }}
        >
        {/* Light, trustworthy header + live state */}
        <View style={{ marginTop: 8 }}>
          <RideStatusHeader
            state={liveRideState}
            title={driverCopy.title}
            subtitle={
              (() => {
                if (!(accepted && headingToPickup)) return driverCopy.subtitle;
                const d = String(arrivalDistLabel || "")
                  .replace(/[^0-9.]/g, "")
                  .trim();
                const t = String(arrivalTimeLabel || "")
                  .replace(/[^0-9.]/g, "")
                  .trim();
                const distNum = d ? Number(d) : 0;
                const timeNum = t ? Number(t) : 0;
                if (!(distNum > 0 || timeNum > 0)) return driverCopy.subtitle;
                const parts: string[] = [];
                if (distNum > 0) parts.push(`${distNum} km`);
                if (timeNum > 0) parts.push(`${Math.round(timeNum)} min`);
                return parts.length ? `Pickup in ${parts.join(" · ")}` : driverCopy.subtitle;
              })()
            }
            arrivingBy={arrivingBy}
            reassurance={accepted ? "Keep your phone visible and drive safely." : undefined}
          />
        </View>

        {(accepted && liveRideState === "heading_to_pickup") ? (
          <TouchableOpacity
            onPress={openNavigation}
            activeOpacity={0.85}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2, paddingTop: 2 }}
          >
            <Ionicons name="navigate-outline" size={16} color="#3C8F7C" />
            <Text style={{ color: "#3C8F7C", fontWeight: "600", fontSize: 13, fontFamily: "RobotoMedium" }}>
              Navigate to the rider
            </Text>
          </TouchableOpacity>
        ) : null}

        {accepted && inTripProgress ? (
          <TouchableOpacity
            onPress={openNavigation}
            activeOpacity={0.85}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2, paddingTop: 2 }}
          >
            <Ionicons name="navigate-outline" size={16} color="#3C8F7C" />
            <Text style={{ color: "#3C8F7C", fontWeight: "600", fontSize: 13, fontFamily: "RobotoMedium" }}>
              Navigate to destination
            </Text>
          </TouchableOpacity>
        ) : null}

        <TripDetailsCard fromLabel={tripContext.fromLabel} toLabel={tripContext.toLabel} />

        {/* Passenger + Fare row */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            elevation: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 5,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              {passengerImage ? (
                <Image
                  source={{ uri: String(passengerImage) }}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6" }}
                />
              ) : (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#E8F5F2",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#3C8F7C", fontFamily: "RobotoBold" }}>
                    {String(passengerName || "")
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("") || "P"}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "RobotoRegular", marginBottom: 1 }}>
                  Passenger
                </Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", fontFamily: "RobotoMedium" }} numberOfLines={1}>
                  {passengerName}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 16, fontWeight: "700", color: "#3C8F7C", fontFamily: "RobotoBold" }}>
              ₦{fareDisplay}
            </Text>
          </View>
        </View>

        <ProgressBar label="Pickup → Dropoff" state={liveRideState} />

        {/* Payment row (separator style) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 6,
            paddingHorizontal: 2,
            borderBottomWidth: 1,
            borderBottomColor: "#EEF2F7",
          }}
        >
          <Text style={{ fontSize: 12, color: "#6B7280", fontFamily: "RobotoRegular" }}>Payment</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons
              name={payment_type === "wallet" ? "wallet-outline" : "cash-outline"}
              size={14}
              color="#3C8F7C"
            />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", fontFamily: "RobotoMedium" }}>
              {paymentUiLabel}
            </Text>
          </View>
        </View>
        </ScrollView>

        <View
          style={[sheetActionFooter, { paddingBottom: footerBottomPad, flexShrink: 0 }]}
          collapsable={false}
        >
          {accepted ? (
            <>
              {(() => {
                const inTrip =
                  liveRideState === "trip_started" || liveRideState === "near_destination";
                const isTooFarFromDropoff =
                  inTrip && typeof distanceToDropoff === "number" && distanceToDropoff > 1000;
                return isTooFarFromDropoff ? (
                  <Text
                    style={{
                      color: "#EF4444",
                      fontSize: 12,
                      textAlign: "center",
                      marginBottom: 8,
                    }}
                  >
                    {`${(distanceToDropoff! / 1000).toFixed(1)}km from destination — get closer to end trip`}
                  </Text>
                ) : null;
              })()}
              <DriverActionButtons
                compact
                state={liveRideState}
                onOpenNavigation={openNavigation}
                onMarkArrived={MarkPickupArrived}
                onStartTrip={StartRide}
                onCompleteTrip={() => {
                  const inTrip =
                    liveRideState === "trip_started" || liveRideState === "near_destination";
                  const isTooFarFromDropoff =
                    inTrip && typeof distanceToDropoff === "number" && distanceToDropoff > 1000;
                  if (isTooFarFromDropoff) {
                    Alert.alert(
                      "Too far from destination",
                      `You are ${(distanceToDropoff! / 1000).toFixed(1)}km away. Get closer before ending the trip.`,
                      [{ text: "OK" }]
                    );
                    return;
                  }
                  Alert.alert("Complete Trip", "Have you arrived at the destination?", [
                    { text: "Not yet", style: "cancel" },
                    {
                      text: "Yes, complete",
                      style: "destructive",
                      onPress: () => CompleteRide(),
                    },
                  ]);
                }}
                onCall={() => {
                  const p = data?.passenger as
                    | { passenger_phone_number?: string; phone?: string }
                    | undefined;
                  const num = (p?.passenger_phone_number || p?.phone || "") as string;
                  if (!num) {
                    showMessage({ type: "warning", message: "Phone number not available" });
                    return;
                  }
                  Linking.openURL(num.startsWith("0") ? `tel:${num}` : `tel:+${num}`).catch(() =>
                    showMessage({ type: "warning", message: "Unable to make call." })
                  );
                }}
                onChat={() => setChatModal(true)}
                onCancel={RejectRide}
                loading={{
                  arrived: loading.arrived,
                  start: loading.start,
                  complete: loading.complete,
                }}
              />
            </>
          ) : (
            <View style={tw`flex-col gap-y-4`}>
              <Pressable
                onPress={AcceptRide}
                hitSlop={OFFER_ACTION_HIT_SLOP}
                style={({ pressed }) => [
                  tw`min-h-[56px] flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[12px]`,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {loading.accept ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={tw.style(`text-base text-white uppercase`, { fontFamily: "RobotoBold" })}>
                    Accept ride
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={RejectRide}
                hitSlop={OFFER_ACTION_HIT_SLOP}
                style={({ pressed }) => [
                  tw`min-h-[56px] flex-row items-center justify-center gap-x-2 py-3 border border-base-green rounded-[12px]`,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {loading.reject ? (
                  <ActivityIndicator color={tw.color("text-base-green")} />
                ) : (
                  <Text style={tw.style(`text-base text-base-green uppercase`, { fontFamily: "RobotoBold" })}>
                    Decline
                  </Text>
                )}
              </Pressable>
              {offerSecondsLeft != null && offerSecondsLeft > 0 ? (
                <Text style={tw.style(`text-xs text-center text-[#6B7280]`, { fontFamily: "RobotoRegular" })}>
                  {offerSecondsLeft}s left to accept
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </BottomSheet>
  );
};

export default NewRide;
