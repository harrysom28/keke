import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  DRIVER_ACCEPT_RIDE,
  DRIVER_COMPLETE_RIDE,
  DRIVER_CONFIRM_PAYMENT,
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
import {
  getArrivingByLabel,
  getDriverHeaderCopy,
  getRideStateFromData,
  getTripContext,
} from "@/components/ride-in-transit/rideStates";
import { RideStatusHeader } from "@/components/ride-in-transit/RideStatusHeader";
import { TripDetailsCard } from "@/components/ride-in-transit/TripDetailsCard";
import { UserInfoCard } from "@/components/ride-in-transit/UserInfoCard";
import { ProgressBar } from "@/components/ride-in-transit/ProgressBar";
import { DriverActionButtons } from "@/components/ride-in-transit/ActionButtons";

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
  /** Wall-clock ms when the sequential offer expires (Bolt-style window). */
  offerDeadlineMs?: number | null;
  onOfferExpired?: () => void;
}

const NewRide = ({
  bottomSheetRef,
  data,
  getActiveRide,
  routeEta = "",
  routeDistance = "",
  chatOpenSignal = 0,
  onOfferResolved,
  offerDeadlineMs = null,
  onOfferExpired,
}: Props) => {
  const { apiConfig } = useContext(AppContext);
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
    data?.ride_id ?? data?.rideId ?? (data as { _id?: string })?._id ?? ""
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
  let payment_type = data?.payment_type?.toLocaleLowerCase() as string;
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
    (data?.fare != null ? String(Math.round(Number(data.fare))) : "");

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

  const liveRideState = getRideStateFromData({
    ...(data as any),
    routeEta,
  });
  const driverCopy = getDriverHeaderCopy(liveRideState);
  const arrivingBy = getArrivingByLabel({ ...(data as any), routeEta });
  const tripContext = getTripContext(data as any);

  const openNavigation = async () => {
    const pickCoord = (o: any) => {
      const lat = o?.lat ?? o?.latitude ?? o?.location?.lat ?? o?.geometry?.location?.lat;
      const lng =
        o?.long ?? o?.lng ?? o?.longitude ?? o?.location?.lng ?? o?.location?.long ?? o?.geometry?.location?.lng;
      const nLat = lat != null ? parseFloat(String(lat)) : NaN;
      const nLng = lng != null ? parseFloat(String(lng)) : NaN;
      return Number.isFinite(nLat) && Number.isFinite(nLng) ? { lat: nLat, lng: nLng } : null;
    };

    const target =
      liveRideState === "heading_to_pickup" || liveRideState === "arrived_pickup"
        ? pickCoord((data as any)?.origin)
        : pickCoord((data as any)?.destination);

    const destParam = target ? `${target.lat},${target.lng}` : encodeURIComponent(
      liveRideState === "heading_to_pickup" || liveRideState === "arrived_pickup"
        ? tripContext.fromLabel
        : tripContext.toLabel
    );
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destParam}&travelmode=driving`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        showMessage({ type: "warning", message: "Unable to open navigation." });
        return;
      }
      Linking.openURL(url);
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
        handleBack();
        showMessage({ type: "success", message: data?.message });
        getActiveRide();
      })
      .catch(handleRideApiError)
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
      .catch(handleRideApiError)
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
        // console.log(data);
        if (payment_type === "wallet") {
          handleBack();
          showMessage({ type: "success", message: data?.message });
        }
        getActiveRide();
      })
      .catch(handleRideApiError)
      .finally(() => setLoading((prev) => ({ ...prev, complete: false })));
  };
  const ConfirmPayment = () => {
    if (!guardRideId()) return;
    setLoading((prev) => ({ ...prev, confirm: true }));
    axios
      .post(DRIVER_CONFIRM_PAYMENT, { rideId }, apiConfig)
      .then(({ data }) => {
        handleBack();
        showMessage({ type: "success", message: data?.message });
        getActiveRide();
      })
      .catch(handleRideApiError)
      .finally(() => setLoading((prev) => ({ ...prev, confirm: false })));
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
      height={"80%"}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`}
    >
      <DriverChatModal
        data={{
          id: (data?.passenger?.passenger_id ||
            (data?.passenger as { user_id?: string } | undefined)?.user_id ||
            "") as string,
          rideId: (data?.ride_id ?? data?.rideId) as string,
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 18 }}
      >
        {/* Light, trustworthy header + live state */}
        <RideStatusHeader
          state={liveRideState}
          title={driverCopy.title}
          subtitle={
            accepted && headingToPickup && (arrivalDistLabel || arrivalTimeLabel)
              ? `Pickup in ${[arrivalDistLabel, arrivalTimeLabel].filter(Boolean).join(" · ")}`
              : driverCopy.subtitle
          }
          arrivingBy={arrivingBy}
          reassurance={accepted ? "Keep your phone visible and drive safely." : undefined}
        />

        <TripDetailsCard fromLabel={tripContext.fromLabel} toLabel={tripContext.toLabel} />

        <UserInfoCard
          title="Passenger"
          imageUrl={passengerImage || null}
          name={passengerName}
          subtitle={(() => {
            const landmark =
              (data as any)?.pickup_landmark ||
              (data as any)?.pickupLandmark ||
              (data as any)?.origin?.landmark ||
              "";
            const note = (data as any)?.note || (data as any)?.passenger_note || "";
            const bits = [landmark && `Landmark: ${landmark}`, note && `Note: ${note}`].filter(Boolean);
            return bits.length ? bits.join(" • ") : null;
          })()}
          rightSlot={
            <Text style={tw.style(`text-base text-[#111827]`, { fontFamily: "RobotoBold" })}>
              ₦{fareDisplay}
            </Text>
          }
        />

        <ProgressBar label="Pickup → Dropoff" state={liveRideState} />

        <View style={tw`mt-2 px-4 flex-row justify-between items-center`}>
          <Text style={tw.style(`text-sm text-[#6B7280]`, { fontFamily: "RobotoRegular" })}>
            Payment
          </Text>
          <Text style={tw.style(`text-sm text-[#111827] uppercase`, { fontFamily: "RobotoMedium" })}>
            {payment_type}
          </Text>
        </View>

        {/* Primary actions */}
        {accepted ? (
          <DriverActionButtons
            state={liveRideState}
            onOpenNavigation={openNavigation}
            onMarkArrived={MarkPickupArrived}
            onStartTrip={StartRide}
            onCompleteTrip={() => {
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
            loading={{ arrived: loading.arrived, start: loading.start, complete: loading.complete }}
          />
        ) : (
          <View style={tw`flex-col mt-5 gap-y-4`}>
            <TouchableOpacity
              onPress={AcceptRide}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[12px]`}
            >
              {loading.accept ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw.style(`text-base text-white uppercase`, { fontFamily: "RobotoBold" })}>
                  Accept ride
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={RejectRide}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-base-green rounded-[12px]`}
            >
              {loading.reject ? (
                <ActivityIndicator color={tw.color("text-base-green")} />
              ) : (
                <Text style={tw.style(`text-base text-base-green uppercase`, { fontFamily: "RobotoBold" })}>
                  Decline
                </Text>
              )}
            </TouchableOpacity>
            {offerSecondsLeft != null && offerSecondsLeft > 0 ? (
              <Text style={tw.style(`text-xs text-center text-[#6B7280]`, { fontFamily: "RobotoRegular" })}>
                {offerSecondsLeft}s left to accept
              </Text>
            ) : null}
          </View>
        )}

        {/* Keep pay-change / confirm-payment flow when dropoff completed */}
        {accepted && hasRideStarted && data?.drop_off_completed ? (
          <View style={tw`flex-col mt-2 gap-y-3`}>
            <TouchableOpacity
              disabled={payment_type === "wallet"}
              onPress={() => setShow(true)}
              style={tw.style(
                `flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[12px]`,
                { opacity: payment_type === "wallet" ? 0 : 1 }
              )}
            >
              <Text style={tw.style(`text-base text-white uppercase`, { fontFamily: "RobotoBold" })}>
                Pay change
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={ConfirmPayment}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[12px]`}
            >
              {loading.confirm ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw.style(`text-base text-white uppercase`, { fontFamily: "RobotoBold" })}>
                  Confirm payment
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
};

export default NewRide;
