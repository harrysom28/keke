import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Vibration } from "react-native";
import { Portal } from "@gorhom/portal";
import { BottomSheetMethods } from "@devvie/bottom-sheet";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "expo-router";

import { AppContext } from "@/app/context";
import { DRIVER_CURRENT_RIDE_OFFER } from "@/constants";
import NewRide from "@/app/(driver)/(tabs)/(dashboard)/_modals/newRide";
import { AppDetailsState, setAppData } from "@/store/AppSlice";
import { TDriverActiveRide } from "@/types";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import {
  isPendingDriverOffer,
  mapApiOfferToRide,
  mapPusherPayloadToOffer,
} from "@/utils/driverRideOffer";

/**
 * Global driver ride-offer sheet — mounted at driver layout level so incoming
 * offers appear on any tab (home dashboard, bookings, etc.), not only home-map.
 */
export default function DriverRideOfferHost() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { apiConfig } = useContext(AppContext);
  const sheetRef = useRef<BottomSheetMethods>(null);
  const declinedOfferRideIdsRef = useRef<Set<string>>(new Set());
  const lastProcessedSeqRef = useRef(0);
  const openSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    driverPendingRideOffer,
    driverRideOfferPusherSeq,
    driverRideOfferPusherPayload,
  } = useSelector(AppDetailsState);

  const [ride, setRide] = useState<Partial<TDriverActiveRide>>({});
  const [offerDeadlineMs, setOfferDeadlineMs] = useState<number | null>(null);

  const scheduleOpenSheet = useCallback(() => {
    if (openSheetTimerRef.current) {
      clearTimeout(openSheetTimerRef.current);
    }
    // BottomSheet ref is not ready on the same tick NewRide mounts — defer open.
    openSheetTimerRef.current = setTimeout(() => {
      openSheetTimerRef.current = null;
      sheetRef.current?.open();
    }, 120);
  }, []);

  const clearOfferUI = useCallback(() => {
    if (openSheetTimerRef.current) {
      clearTimeout(openSheetTimerRef.current);
      openSheetTimerRef.current = null;
    }
    dispatch(setAppData({ driverPendingRideOffer: false }));
    sheetRef.current?.close();
    setOfferDeadlineMs(null);
    setRide({});
  }, [dispatch]);

  const showOffer = useCallback(
    (offerRide: Partial<TDriverActiveRide>) => {
      const rideIdStr = String(offerRide.ride_id ?? "").trim();
      if (!rideIdStr || declinedOfferRideIdsRef.current.has(rideIdStr)) {
        clearOfferUI();
        return;
      }
      declinedOfferRideIdsRef.current.delete(rideIdStr);
      const expiresSec = Number(offerRide.offer_expires_in ?? 60);
      dispatch(setAppData({ driverPendingRideOffer: true }));
      setRide(offerRide);
      setOfferDeadlineMs(Date.now() + Math.max(1, expiresSec) * 1000);
    },
    [clearOfferUI, dispatch]
  );

  const refreshCurrentOffer = useCallback(() => {
    axios
      .get(DRIVER_CURRENT_RIDE_OFFER, apiConfig)
      .then(({ data }) => {
        const offerRide = data?.data?.ride ?? null;
        if (!offerRide || typeof offerRide !== "object") {
          if (!isPendingDriverOffer(ride)) {
            clearOfferUI();
          }
          return;
        }
        showOffer(mapApiOfferToRide(offerRide as Record<string, unknown>));
      })
      .catch((err) => {
        if (err?.response?.status === 404) return;
        const errorMessage = getErrorMessage(
          err,
          "An error occurred. Please try again."
        );
        safeShowMessage({ type: "danger", message: errorMessage });
      });
  }, [apiConfig, clearOfferUI, ride, showOffer]);

  const handleDeclineOffer = useCallback(
    (rideId: string) => {
      const id = String(rideId || "").trim();
      if (id) declinedOfferRideIdsRef.current.add(id);
      clearOfferUI();
    },
    [clearOfferUI]
  );

  const handleOfferExpired = useCallback(() => {
    clearOfferUI();
    refreshCurrentOffer();
  }, [clearOfferUI, refreshCurrentOffer]);

  const goToMapAfterAccept = useCallback(() => {
    router.navigate("/(driver)/(tabs)/(dashboard)/home-map");
  }, [router]);

  useEffect(() => {
    const seq = driverRideOfferPusherSeq ?? 0;
    if (!seq || seq === lastProcessedSeqRef.current) return;
    lastProcessedSeqRef.current = seq;

    const payload = driverRideOfferPusherPayload;
    if (payload && typeof payload === "object") {
      Vibration.vibrate([0, 400, 200, 400]);
      showOffer(mapPusherPayloadToOffer(payload as Record<string, unknown>));
      dispatch(setAppData({ driverRideOfferPusherPayload: null }));
      return;
    }

    if (driverPendingRideOffer) {
      refreshCurrentOffer();
    }
  }, [
    driverRideOfferPusherSeq,
    driverRideOfferPusherPayload,
    driverPendingRideOffer,
    dispatch,
    refreshCurrentOffer,
    showOffer,
  ]);

  // Open sheet only after ride state is committed and NewRide has mounted.
  useEffect(() => {
    const rideId = String(ride?.ride_id ?? "").trim();
    if (!rideId || !offerDeadlineMs) return;
    if (declinedOfferRideIdsRef.current.has(rideId)) return;
    scheduleOpenSheet();
    return () => {
      if (openSheetTimerRef.current) {
        clearTimeout(openSheetTimerRef.current);
        openSheetTimerRef.current = null;
      }
    };
  }, [ride?.ride_id, offerDeadlineMs, scheduleOpenSheet]);

  // Notification-only path: pending flag without payload — poll until offer loads.
  useEffect(() => {
    if (!driverPendingRideOffer) return;
    if (String(ride?.ride_id ?? "").trim()) return;

    refreshCurrentOffer();
    const interval = setInterval(refreshCurrentOffer, 4000);
    return () => clearInterval(interval);
  }, [driverPendingRideOffer, ride?.ride_id, refreshCurrentOffer]);

  useEffect(
    () => () => {
      if (openSheetTimerRef.current) {
        clearTimeout(openSheetTimerRef.current);
      }
    },
    []
  );

  return (
    <Portal>
      <NewRide
        data={ride}
        bottomSheetRef={sheetRef}
        getActiveRide={goToMapAfterAccept}
        onOfferResolved={() =>
          dispatch(setAppData({ driverPendingRideOffer: false }))
        }
        onDeclineOffer={handleDeclineOffer}
        offerDeadlineMs={offerDeadlineMs}
        onOfferExpired={handleOfferExpired}
      />
    </Portal>
  );
}
