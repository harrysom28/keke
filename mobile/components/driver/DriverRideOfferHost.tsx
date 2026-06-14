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
 * Global driver ride-offer sheet — mounted at tab layout level so incoming
 * offers appear on any tab (home dashboard, bookings, etc.), not only home-map.
 */
export default function DriverRideOfferHost() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { apiConfig } = useContext(AppContext);
  const sheetRef = useRef<BottomSheetMethods>(null);
  const declinedOfferRideIdsRef = useRef<Set<string>>(new Set());
  const lastProcessedSeqRef = useRef(0);

  const {
    driverPendingRideOffer,
    driverRideOfferPusherSeq,
    driverRideOfferPusherPayload,
  } = useSelector(AppDetailsState);

  const [ride, setRide] = useState<Partial<TDriverActiveRide>>({});
  const [offerDeadlineMs, setOfferDeadlineMs] = useState<number | null>(null);

  const openSheet = useCallback(() => {
    requestAnimationFrame(() => {
      sheetRef.current?.open();
    });
  }, []);

  const clearOfferUI = useCallback(() => {
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
      openSheet();
    },
    [clearOfferUI, dispatch, openSheet]
  );

  const refreshCurrentOffer = useCallback(() => {
    axios
      .get(DRIVER_CURRENT_RIDE_OFFER, apiConfig)
      .then(({ data }) => {
        const offerRide = data?.data?.ride ?? null;
        if (!offerRide || typeof offerRide !== "object") {
          clearOfferUI();
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
  }, [apiConfig, clearOfferUI, showOffer]);

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

  if (!isPendingDriverOffer(ride) && !driverPendingRideOffer) {
    return null;
  }

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
