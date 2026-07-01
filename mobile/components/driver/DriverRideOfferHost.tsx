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
import { getErrorMessage, isRateLimitError } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import {
  isPendingDriverOffer,
  mapApiOfferToRide,
  resolveOfferPayload,
} from "@/utils/driverRideOffer";

const OFFER_POLL_MS = 15_000;
const MAX_EMPTY_OFFER_POLLS = 8;

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
  const emptyOfferPollsRef = useRef(0);
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
      openSheetTimerRef.current = null;
    }
    // The sheet is portal-mounted at the layout root, so its imperative ref is
    // not guaranteed to be attached on the tick the offer state commits —
    // especially off the map where nothing else is forcing a re-render/layout.
    // Retry until the ref is ready instead of firing a single one-shot that can
    // be silently dropped (which made offers appear only on the map screen).
    let attempts = 0;
    const tryOpen = () => {
      if (sheetRef.current) {
        sheetRef.current.open();
        openSheetTimerRef.current = null;
        return;
      }
      if (attempts++ >= 25) {
        openSheetTimerRef.current = null;
        return;
      }
      openSheetTimerRef.current = setTimeout(tryOpen, 80);
    };
    openSheetTimerRef.current = setTimeout(tryOpen, 60);
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
          emptyOfferPollsRef.current += 1;
          if (emptyOfferPollsRef.current >= MAX_EMPTY_OFFER_POLLS) {
            emptyOfferPollsRef.current = 0;
            if (!isPendingDriverOffer(ride)) {
              clearOfferUI();
            }
          }
          return;
        }
        emptyOfferPollsRef.current = 0;
        showOffer(mapApiOfferToRide(offerRide as Record<string, unknown>));
      })
      .catch((err) => {
        if (err?.response?.status === 404 || isRateLimitError(err)) {
          return;
        }
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
      const offer = resolveOfferPayload(payload as Record<string, unknown>);
      if (offer) {
        Vibration.vibrate([0, 400, 200, 400]);
        emptyOfferPollsRef.current = 0;
        showOffer(offer);
        dispatch(setAppData({ driverRideOfferPusherPayload: null }));
        return;
      }
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
    if (!driverPendingRideOffer) {
      emptyOfferPollsRef.current = 0;
      return;
    }
    if (String(ride?.ride_id ?? "").trim()) return;

    refreshCurrentOffer();
    const interval = setInterval(refreshCurrentOffer, OFFER_POLL_MS);
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
