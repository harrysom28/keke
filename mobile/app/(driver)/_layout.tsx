import { Stack } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Vibration } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import usePusherChannel from "@/hooks/usePusherChannel";
import { useDriverSession } from "@/hooks/useDriverSession";
import DriverRideOfferHost from "@/components/driver/DriverRideOfferHost";
import { AppDetailsState, setAppData } from "@/store/AppSlice";
import { AuthState } from "@/store/AuthSlice";
/**
 * Single subscription to `private-driver-{id}` for the whole driver area (tabs + stack).
 * Keeps ride offers and online-time updates when no single tab is focused.
 */
function DriverPrivateChannelSubscription() {
  const { user } = useSelector(AuthState);
  const dispatch = useDispatch();

  const driverOfferChannel = useMemo(() => {
    const id = user?.profile?.driver_id;
    return id ? `private-driver-${id}` : "";
  }, [user?.profile?.driver_id]);

  usePusherChannel({
    channel: driverOfferChannel || "private-driver-offer-miss",
    visible: !!driverOfferChannel,
    onEvent: (event) => {
      const ev = event as { eventName?: string; name?: string; data?: unknown };
      const name = ev.eventName ?? ev.name;
      if (name === "ONLINE_TIME_UPDATE") {
        let raw: unknown = ev.data;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            raw = {};
          }
        }
        const label =
          raw && typeof raw === "object" && raw !== null && "timeOnline" in raw
            ? String((raw as { timeOnline?: string }).timeOnline)
            : "";
        if (label) {
          dispatch(setAppData({ driverTimeOnlineFromPusher: label }));
        }
        return;
      }

      let payload: Record<string, unknown> = {};
      if (typeof event.data === "string") {
        try {
          payload = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      } else if (event.data && typeof event.data === "object") {
        payload = event.data as Record<string, unknown>;
      }

      // Rider cancelled (or matching stopped) while this driver still has accept/decline open.
      if (name === "ride_cancelled" || name === "ride-cancelled") {
        const rideId = String(
          payload.ride_id ?? payload.rideId ?? ""
        ).trim();
        dispatch(
          setAppData({
            driverPendingRideOffer: false,
            driverRideOfferPusherPayload: null,
            driverRideOfferRevokeRideId: rideId || null,
            driverRideOfferRevokeSeq: Date.now(),
          })
        );
        return;
      }

      if (name !== "ride-request") return;

      dispatch(
        setAppData({
          driverPendingRideOffer: true,
          driverRideOfferPusherPayload: payload,
          driverRideOfferPusherSeq: Date.now(),
        })
      );
      Vibration.vibrate([0, 400, 200, 400]);
    },
  });

  return null;
}

function DriverSessionHost() {
  const { driverTripEndedSeq } = useSelector(AppDetailsState);
  const { refreshOnlineStatus } = useDriverSession();

  useEffect(() => {
    if (!driverTripEndedSeq) return;
    void refreshOnlineStatus();
  }, [driverTripEndedSeq, refreshOnlineStatus]);

  return null;
}

export default function AppLayout() {
  return (
    <>
      <DriverSessionHost />
      <DriverPrivateChannelSubscription />
      <DriverRideOfferHost />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dailyActivities" />
        <Stack.Screen name="notifications" />
      </Stack>
    </>
  );
}
