import { BackHandler, ScrollView, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { AntDesign } from "@expo/vector-icons";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearRideState, setAppData, setRideData, setRideUtils } from "@/store/AppSlice";
import { useDriverRequestTimeout } from "@/hooks/useDriverRequestTimeout";

import CancelRideModal from "@/components/find-ride/cancelRide";
import DriverChatModal from "@/shared/modal/driverChat";
import { DriverInfoView } from "@/components/find-ride/driverInfo";
import { DriverView } from "@/components/find-ride/driver";
import { IARide } from "../home";
import ReviewSheet from "@/components/find-ride/feedbackReview";
import { RideSummaryView } from "@/components/find-ride/rideSummary";
import { SearchView } from "@/components/find-ride/search";
import { TRide } from "@/types";
import { WaitingView } from "@/components/find-ride/waiting";
import apiClient from "@/utils/apiClient";
import { getErrorMessage, showErrorMessage } from "@/utils/errorHandler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";
import { router, useFocusEffect } from "expo-router";
import { AppContext } from "@/app/context";
import { isRiderMatchedOrBeyond } from "@/utils/activeRidePayload";
import { pusherManager } from "@/utils/pusherManager";
import { isValidMongoRideId, resolveRideId } from "@/utils/resolveRideId";
import { suppressRiderCancelToast } from "@/utils/rideCancellation";
import { useDevvieSheetHeight } from "@/hooks/useDevvieSheetHeight";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  currentView: IARide;
  setCurrentView: React.Dispatch<React.SetStateAction<IARide>>;
  getActiveRide: () => void;
  temp: TRide;
  setTemp?: React.Dispatch<React.SetStateAction<TRide>>;
  clearMap?: (opts?: { navigateHome?: boolean }) => void;
  /** Persist completed-ride snapshot for summary (must run before any state wipe). */
  onTripCompleted?: (snapshot: Record<string, unknown>) => void;
  /** Increment (e.g. from notification deep link) to open the driver chat modal. */
  chatOpenSignal?: number;
}

const ActiveRideSheet = ({
  bottomSheetRef,
  currentView,
  setCurrentView,
  getActiveRide,
  temp,
  setTemp,
  clearMap,
  onTripCompleted,
  chatOpenSignal = 0,
}: Props) => {
  const dispatch = useDispatch();
  const { pusherReady } = useContext(AppContext);
  const { sheetHeight, maxBodyHeight, onBodyLayout } = useDevvieSheetHeight();
  const [modal, setModal] = useState<boolean>(false);
  const [chatModal, setChatModal] = useState<boolean>(false);
  const [summaryRide, setSummaryRide] = useState<Record<string, unknown> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChatKickRef = useRef(0);
  const blankAutoClosedRef = useRef(false);
  const lastTripUpdateAtRef = useRef<number>(Date.now());
  const tripPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tripPollDelayMsRef = useRef<number>(5 * 60 * 1000);
  /** Filled after `useDriverRequestTimeout` — avoids TDZ and unstable Pusher effect deps. */
  const cancelDriverRequestTimersRef = useRef<() => void>(() => {});

  const handleDismissTripUI = useCallback(() => {
    try {
      cancelDriverRequestTimersRef.current();
    } catch {
      // ignore
    }
    try {
      dispatch(clearRideState());
    } catch {
      // ignore
    }
    try {
      clearMap?.({ navigateHome: true });
    } catch {
      // ignore
    }
    try {
      bottomSheetRef?.current?.close();
    } catch {
      // ignore
    }
    try {
      setCurrentView((prev) => ({ ...prev, screen: "", data: {} as any }));
    } catch {
      // ignore
    }
  }, [bottomSheetRef, clearMap, dispatch, setCurrentView]);

  const rideDataForWaiting = useMemo(() => {
    if (currentView?.data?.waiting && Object.keys(currentView.data.waiting).length > 0) {
      return currentView.data.waiting;
    }
    if (temp && Object.keys(temp).length > 0) {
      return temp;
    }
    return {} as TRide;
  }, [currentView?.data?.waiting, temp]);

  const activeRideId = useMemo(() => {
    const rd: any = rideDataForWaiting || {};
    return String(rd?.ride_id || rd?._id || "").trim();
  }, [rideDataForWaiting]);

  const handleTripResolved = useCallback(
    (rideId: string) => {
      try {
        cancelDriverRequestTimersRef.current();
      } catch {
        // ignore
      }

      const snapshot: Record<string, unknown> = {
        ...((rideDataForWaiting as Record<string, unknown>) || {}),
        ...((temp as Record<string, unknown>) || {}),
        ride_id: rideId || (temp as { ride_id?: string })?.ride_id,
        status: "completed",
      };

      setSummaryRide(snapshot);
      setTemp?.(snapshot as TRide);

      if (onTripCompleted) {
        onTripCompleted(snapshot);
        try {
          setCurrentView((prev) => ({
            ...prev,
            screen: "SUMMARY",
            data: {
              ...((prev?.data) as object),
              waiting: snapshot as IARide["data"]["waiting"],
            } as IARide["data"],
          }));
        } catch {
          // ignore
        }
        return;
      }

      try {
        setCurrentView((prev) => ({
          ...prev,
          screen: "SUMMARY",
          data: {
            ...((prev?.data) as object),
            waiting: snapshot as IARide["data"]["waiting"],
          } as IARide["data"],
        }));
      } catch {
        // ignore
      }

      setTimeout(() => {
        try {
          bottomSheetRef?.current?.open();
        } catch {
          // ignore
        }
      }, 150);
    },
    [
      bottomSheetRef,
      onTripCompleted,
      rideDataForWaiting,
      setCurrentView,
      setTemp,
      temp,
    ]
  );

  const riderMatchedOrBeyond = useMemo(
    () => isRiderMatchedOrBeyond(rideDataForWaiting as Record<string, unknown>),
    [rideDataForWaiting]
  );

  const summaryPayload = useMemo(() => {
    const waiting = currentView?.data?.waiting as Record<string, unknown> | undefined;
    return {
      ...(summaryRide || {}),
      ...(temp as Record<string, unknown>),
      ...(waiting && Object.keys(waiting).length > 0 ? waiting : {}),
    };
  }, [currentView?.data?.waiting, summaryRide, temp]);

  const summaryRideId = useMemo(() => {
    const id =
      summaryPayload?.ride_id ??
      (summaryPayload as { _id?: string })?._id;
    return id != null ? String(id).trim() : "";
  }, [summaryPayload]);

  useEffect(() => {
    if (currentView?.screen !== "SUMMARY" || !summaryRideId) return;

    const baseFare = Number(summaryPayload?.cost ?? 0);
    const fb = summaryPayload?.fare_breakdown as
      | { total_paid?: number; service_charge?: number }
      | undefined;
    const hasFare =
      baseFare > 0 ||
      Number(fb?.total_paid) > 0 ||
      Number(fb?.service_charge) > 0 ||
      Number((summaryPayload?.fareBreakdown as { total?: number })?.total) > 0;

    if (hasFare) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`rides/${summaryRideId}`);
        const detail =
          res?.data?.data?.ride ?? res?.data?.ride ?? res?.data?.data ?? null;
        if (!detail || typeof detail !== "object" || cancelled) return;

        const fb = (detail as { fare_breakdown?: Record<string, unknown> })
          .fare_breakdown;
        const merged: Record<string, unknown> = {
          ...summaryPayload,
          ...detail,
          ride_id: summaryRideId,
          status: "completed",
          origin: (detail as { origin?: unknown }).origin ?? summaryPayload.origin,
          destination:
            (detail as { destination?: unknown }).destination ??
            summaryPayload.destination,
        };
        if (fb && typeof fb === "object") {
          merged.fare_breakdown = fb;
          merged.cost = String(fb.ride_fare ?? merged.cost ?? "");
          merged.fareBreakdown = {
            baseFare: Number(fb.ride_fare) || 0,
            serviceCharge: Number(fb.service_charge) || 0,
            total: Number(fb.total_paid) || 0,
          };
        }
        setSummaryRide(merged);
        setTemp?.(merged as TRide);
      } catch {
        // keep local snapshot
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentView?.screen, summaryRideId, summaryPayload, setTemp]);

  const handleTripResolvedRef = useRef(handleTripResolved);
  handleTripResolvedRef.current = handleTripResolved;

  // Subscribe to trip resolution events (force-complete / flagged / completed)
  useEffect(() => {
    if (!pusherReady) return;
    if (!activeRideId) return;

    const channel = `private.ride.${activeRideId}`;
    lastTripUpdateAtRef.current = Date.now();

    const onAnyResolution = (payload: any) => {
      lastTripUpdateAtRef.current = Date.now();
      const rideIdFromPayload = String(payload?.rideId || payload?.ride_id || "").trim();
      const id = rideIdFromPayload || activeRideId;
      handleTripResolvedRef.current(id);
    };

    const cleanup = pusherManager.subscribeMany(
      channel,
      ["trip:force_completed", "trip:flagged", "trip:completed", "ride.completed"],
      onAnyResolution
    );

    const cleanupApproaching = pusherManager.subscribe(
      channel,
      "ride:approaching_destination",
      () => {
        showMessage({
          type: "success",
          message: "You're almost at your destination! 🎉",
          duration: 5000,
        });
      }
    );

    return () => {
      try {
        cleanup();
      } catch {
        // ignore
      }
      try {
        cleanupApproaching();
      } catch {
        // ignore
      }
    };
  }, [activeRideId, pusherReady]);

  // Polling fallback: if no trip status update for >=5 minutes, check backend status
  useEffect(() => {
    if (!activeRideId) return;

    const statusRaw = String((rideDataForWaiting as any)?.status ?? "").toLowerCase();
    const inProgress = statusRaw === "in-progress" || statusRaw === "in_progress" || statusRaw === "started";
    if (!inProgress) return;

    const scheduleNext = () => {
      if (tripPollTimeoutRef.current) clearTimeout(tripPollTimeoutRef.current);
      const delay = Math.max(5 * 60 * 1000, tripPollDelayMsRef.current);
      tripPollTimeoutRef.current = setTimeout(async () => {
        try {
          const now = Date.now();
          if (now - lastTripUpdateAtRef.current < 5 * 60 * 1000) {
            scheduleNext();
            return;
          }

          const res = await apiClient.get(`rides/${activeRideId}`);
          const nextStatus = String(res?.data?.data?.ride?.status ?? res?.data?.ride?.status ?? "").toLowerCase();
          lastTripUpdateAtRef.current = Date.now();

          if (nextStatus && nextStatus !== "in-progress" && nextStatus !== "in_progress") {
            handleTripResolved(activeRideId);
            return;
          }
        } catch {
          // ignore network errors; backoff and retry later
        } finally {
          tripPollDelayMsRef.current = Math.min(tripPollDelayMsRef.current * 2, 20 * 60 * 1000);
          scheduleNext();
        }
      }, delay);
    };

    tripPollDelayMsRef.current = 5 * 60 * 1000;
    scheduleNext();

    return () => {
      if (tripPollTimeoutRef.current) clearTimeout(tripPollTimeoutRef.current);
      tripPollTimeoutRef.current = null;
    };
  }, [activeRideId, handleTripResolved, rideDataForWaiting]);

  const showStaleRideWarning = useMemo(() => {
    const ride = rideDataForWaiting as any;
    const st =
      typeof ride?.status === "string"
        ? ride.status.toLowerCase()
        : String(ride?.status ?? "").toLowerCase();
    if (st !== "accepted" || ride?.is_ride_started !== false) return false;
    const u = ride?.updatedAt;
    if (!u) return false;
    const isStale = Date.now() - new Date(u).getTime() > 30 * 60 * 1000;
    return isStale;
  }, [rideDataForWaiting]);

  const resolvedScreenForLayout = useMemo(() => {
    const rideId =
      (currentView?.data?.waiting as any)?.ride_id ||
      (currentView?.data?.waiting as any)?._id ||
      (temp as any)?.ride_id ||
      (temp as any)?._id;
    return currentView?.screen || (rideId ? "WAITING" : "");
  }, [currentView?.screen, currentView?.data?.waiting, temp]);

  useEffect(() => {
    if (!chatOpenSignal || chatOpenSignal === lastChatKickRef.current) return;
    lastChatKickRef.current = chatOpenSignal;
    setChatModal(true);
  }, [chatOpenSignal]);

  const handleBack = () => {
    bottomSheetRef?.current?.close();
    setTimeout(() => {
      dispatch(
        setAppData({
          isBooking: false,
        })
      );
    }, 200);
    setCurrentView((prev) => ({ ...prev, screen: "" }));
    dispatch(clearRideState());
    if (clearMap) {
      clearMap({ navigateHome: true });
    }
  };

  const rideIdForHook =
    rideDataForWaiting?.ride_id ||
    (rideDataForWaiting as any)?._id ||
    (rideDataForWaiting as any)?.rideId;

  // Self-heal: after reload, Home may open the sheet before `currentView.screen`
  // is restored. If we have a real rideId, ensure we render WAITING.
  useEffect(() => {
    if (!rideIdForHook) return;
    if (currentView?.screen) return;
    setCurrentView((prev) => ({
      ...prev,
      screen: "WAITING",
      data: {
        ...(prev?.data ?? {}),
        waiting: (rideDataForWaiting as any) ?? (prev?.data as any)?.waiting ?? {},
      },
    }));
  }, [rideIdForHook, currentView?.screen, setCurrentView, rideDataForWaiting]);

  useEffect(() => {
    if (!__DEV__) return;
    // High-signal debug for the "blank sheet" report.
    const payloadKeys =
      rideDataForWaiting && typeof rideDataForWaiting === "object"
        ? Object.keys(rideDataForWaiting as any).length
        : 0;
    const st = String((rideDataForWaiting as any)?.status ?? "").toLowerCase();
    console.log("ActiveRideSheet render state:", {
      resolvedScreenForLayout,
      rideIdForHook: rideIdForHook ? String(rideIdForHook) : null,
      payloadKeys,
      status: st,
      accepted: riderMatchedOrBeyond,
    });
  }, [rideIdForHook, rideDataForWaiting, resolvedScreenForLayout, riderMatchedOrBeyond]);

  // Safety: if the sheet gets opened with no valid ride payload (stale state / race),
  // immediately close so the user is never trapped on a blank sheet.
  useEffect(() => {
    const hasWaitingPayload =
      rideDataForWaiting && Object.keys(rideDataForWaiting as any).length > 0;
    const screen = resolvedScreenForLayout;
    const shouldAutoClose =
      (screen === "" || screen === "WAITING") && !rideIdForHook && !hasWaitingPayload;
    if (!shouldAutoClose) {
      blankAutoClosedRef.current = false;
      return;
    }
    if (blankAutoClosedRef.current) return;
    blankAutoClosedRef.current = true;

    dispatch(clearRideState());
    if (clearMap) clearMap();
    bottomSheetRef?.current?.close();
    setCurrentView((prev) => {
      const alreadyClosed =
        prev?.screen === "" &&
        (!prev?.data?.waiting || Object.keys(prev.data.waiting as any).length === 0);
      return alreadyClosed ? prev : { ...prev, screen: "", data: { waiting: {} as any } };
    });
  }, [
    rideIdForHook,
    rideDataForWaiting,
    resolvedScreenForLayout,
    dispatch,
    clearMap,
    bottomSheetRef,
    setCurrentView,
  ]);

  const isRideAcceptedByDriver = riderMatchedOrBeyond;

  const screenForTimeout =
    currentView?.screen || (rideIdForHook ? "WAITING" : "");

  const driverRequestTimeoutEnabled =
    screenForTimeout === "WAITING" && !!rideIdForHook && !isRideAcceptedByDriver;

  const reassignDriver = useCallback(
    async (
      reason: string,
      loading?: React.Dispatch<React.SetStateAction<boolean>>
    ): Promise<boolean> => {
      if (loading) loading(true);
      const rideId =
        (currentView?.data?.waiting as any)?.ride_id ||
        (currentView?.data?.waiting as any)?.rideId ||
        (temp as any)?.ride_id ||
        (temp as any)?.rideId;

      if (!rideId) {
        loading?.(false);
        showMessage({
          type: "danger",
          message: "Ride ID not found. Please try again.",
        });
        return false;
      }

      try {
        const { data } = await apiClient.post("booking/ride/assign-new-driver", {
          rideId,
          reason,
        });
        showMessage({
          type: "success",
          message: data?.message || "New driver assigned successfully",
        });
        getActiveRide();
        setCurrentView((prev) => ({
          ...prev,
          screen: "WAITING",
          data: {
            ...prev.data,
            waiting: data?.data?.ride || prev.data?.waiting,
          },
        }));
        return true;
      } catch (err: unknown) {
        showErrorMessage(err, {
          fallback: "Failed to assign a new driver. Please try again.",
        });
        return false;
      } finally {
        loading?.(false);
      }
    },
    [currentView?.data?.waiting, temp, getActiveRide, setCurrentView]
  );

  const {
    secondsLeft,
    phase,
    retryNow,
    cancel: cancelDriverRequestTimers,
    markAccepted,
  } = useDriverRequestTimeout({
    enabled: driverRequestTimeoutEnabled,
    sessionKey: rideIdForHook ?? null,
    onRetryDriver: async () => {
      const ok = await reassignDriver("Driver did not respond in time");
      if (!ok) throw new Error("reassign failed");
    },
    onExhausted: () => {
      showMessage({
        type: "info",
        message: "No drivers available right now. Try again in a moment.",
      });
    },
  });

  useEffect(() => {
    cancelDriverRequestTimersRef.current = cancelDriverRequestTimers;
  }, [cancelDriverRequestTimers]);

  useEffect(() => {
    if (isRideAcceptedByDriver) {
      markAccepted();
    }
  }, [isRideAcceptedByDriver, markAccepted]);

  const waitingSubtitleOverride = useMemo(() => {
    if (isRideAcceptedByDriver) return undefined;
    if (phase === "cooldown" || phase === "retrying") {
      return "Finding another driver…";
    }
    if (secondsLeft != null && phase === "countdown") {
      return `Searching for nearby drivers… (${secondsLeft}s)`;
    }
    if (phase === "exhausted") {
      return "We couldn't get a driver. Try again or search the area again.";
    }
    return undefined;
  }, [isRideAcceptedByDriver, secondsLeft, phase]);

  const cancelRideId = useMemo(() => {
    const waiting = currentView?.data?.waiting as Record<string, unknown> | undefined;
    return (
      resolveRideId(waiting) ||
      resolveRideId(temp as Record<string, unknown>) ||
      rideIdForHook ||
      ""
    );
  }, [currentView?.data?.waiting, temp, rideIdForHook]);

  const finishCancelRideUI = useCallback(() => {
    cancelDriverRequestTimers();
    dispatch(clearRideState());
    if (clearMap) clearMap({ navigateHome: true });
    bottomSheetRef?.current?.close();
    setCurrentView((prev) => ({ ...prev, screen: "" }));
    setModal(false);
  }, [
    bottomSheetRef,
    cancelDriverRequestTimers,
    clearMap,
    dispatch,
    setCurrentView,
  ]);

  const CancelRide = (
    data: { reason: string; description: string },
    loading: React.Dispatch<React.SetStateAction<boolean>>,
    executable: () => void,
    showError: (text: string) => void
  ) => {
    const rideId = cancelRideId;
    if (!rideId || !isValidMongoRideId(rideId)) {
      showError("Could not find this ride. Close and refresh, then try again.");
      return;
    }

    const reason = data.description
      ? `${data.reason}: ${data.description}`
      : data.reason;

    loading(true);
    (async () => {
      try {
        await apiClient.post("booking/cancel-ride", { rideId, reason });
        suppressRiderCancelToast();
        showMessage({ type: "success", message: "Ride cancelled" });
        executable();
        finishCancelRideUI();
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number }; status?: number })?.response
          ?.status ?? (err as { status?: number })?.status;
        if (status === 404) {
          suppressRiderCancelToast();
          showMessage({ type: "success", message: "Ride cancelled" });
          executable();
          finishCancelRideUI();
          return;
        }
        showError(
          getErrorMessage(err, "Could not cancel ride. Please try again.")
        );
      } finally {
        loading(false);
      }
    })();
  };

  const ReassignDriver = (
    _driver_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    reassignDriver("Requested new driver", loading);
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
    }, [currentView?.screen])
  );

  const RenderView = useCallback(() => {
    // If no screen is set but we have ride data, default to WAITING
    const rideId =
      (currentView?.data?.waiting as any)?.ride_id ||
      (currentView?.data?.waiting as any)?._id ||
      (temp as any)?.ride_id ||
      (temp as any)?._id;
    const screen = currentView?.screen || (rideId ? "WAITING" : "");
    
    // Get the ride data - prioritize currentView, then temp
    const rideData = currentView?.data?.waiting && Object.keys(currentView.data.waiting).length > 0
      ? currentView.data.waiting
      : (temp && Object.keys(temp).length > 0 ? temp : {});

    switch (screen) {
      case "WAITING":
        return (
          <WaitingView
            key={rideId || 'waiting'}
            ride={rideData}
            waitingSubtitleOverride={waitingSubtitleOverride}
            onTripResolved={handleTripResolved}
            onDismissTripUI={handleDismissTripUI}
            onRequestNewDriver={retryNow}
            onSearchAgain={() => {
              const rd = rideData as any;
              const vehicleTypeId =
                rd?.vehicle_id ||
                rd?.vehicle_type_id ||
                (temp as any)?.vehicle_id ||
                (temp as any)?.vehicle_type_id;
              dispatch(
                setRideData({
                  origin: rd?.origin || (temp as any)?.origin,
                  destination: rd?.destination || (temp as any)?.destination,
                  vehicle_type_id: vehicleTypeId || undefined,
                } as any)
              );
              setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
            }}
            info={(driver_id) => {
              dispatch(
                setRideUtils({
                  driver_id,
                })
              );
              setCurrentView((prev) => ({ ...prev, screen: "DRIVER" }));
            }}
            action={() => {
              const rd = rideData as any;
              const vehicleTypeId =
                rd?.vehicle_id ||
                rd?.vehicle_type_id ||
                (temp as any)?.vehicle_id ||
                (temp as any)?.vehicle_type_id;
              dispatch(
                setRideData({
                  origin: rd?.origin || (temp as any)?.origin,
                  destination: rd?.destination || (temp as any)?.destination,
                  vehicle_type_id: vehicleTypeId || undefined,
                } as any)
              );
              setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
            }}
            cancel={() => {
              cancelDriverRequestTimers();
              setModal(true);
            }}
            chat={() => {
              const driver = (rideData as any)?.driver || (temp as any)?.driver;
              if (driver && (driver.driver_id || driver.user_id || (driver as any)?.user?._id)) {
                setChatModal(true);
              } else {
                showMessage({
                  type: "warning",
                  message: "Driver information not available yet",
                });
              }
            }}
          />
        );
      case "SUMMARY":
        return (
          <RideSummaryView
            ride={summaryPayload}
            onContinue={() =>
              setCurrentView((prev) => ({ ...prev, screen: "REVIEW" }))
            }
            onDone={handleBack}
          />
        );
      case "REVIEW":
        return <ReviewSheet temp={temp} action={handleBack} />;
      case "SEARCH":
        return (
          <SearchView
            back={() =>
              setCurrentView((prev) => ({ ...prev, screen: "WAITING" }))
            }
            action={() =>
              setCurrentView((prev) => ({ ...prev, screen: "DRIVERS" }))
            }
          />
        );
      case "DRIVERS":
        return (
          <DriverView
            action={() =>
              setCurrentView((prev) => ({ ...prev, screen: "DRIVER" }))
            }
            reassign={(item, loading) => ReassignDriver(item, loading)}
            isActive
            onChangeLocation={() =>
              setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }))
            }
          />
        );
      case "DRIVER":
        return (
          <DriverInfoView
            clear={() => setModal(true)}
            back={handleBack}
            isActive
          />
        );
      default:
        // If no screen is explicitly set but there's active ride data, show WAITING
        if (rideId && Object.keys(rideData).length > 0) {
          return (
            <WaitingView
              key={rideId || 'waiting-fallback'}
              ride={rideData}
              waitingSubtitleOverride={waitingSubtitleOverride}
              onTripResolved={handleTripResolved}
              onDismissTripUI={handleDismissTripUI}
              onRequestNewDriver={retryNow}
              onSearchAgain={() => {
                const rd = rideData as any;
                const vehicleTypeId =
                  rd?.vehicle_id ||
                  rd?.vehicle_type_id ||
                  (temp as any)?.vehicle_id ||
                  (temp as any)?.vehicle_type_id;
                dispatch(
                  setRideData({
                    origin: rd?.origin || (temp as any)?.origin,
                    destination: rd?.destination || (temp as any)?.destination,
                    vehicle_type_id: vehicleTypeId || undefined,
                  } as any)
                );
                setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
              }}
              info={(driver_id) => {
                dispatch(setRideUtils({ driver_id }));
                setCurrentView((prev) => ({ ...prev, screen: "DRIVER" }));
              }}
              action={() => {
                const rd = rideData as any;
                const vehicleTypeId =
                  rd?.vehicle_id ||
                  rd?.vehicle_type_id ||
                  (temp as any)?.vehicle_id ||
                  (temp as any)?.vehicle_type_id;
                dispatch(
                  setRideData({
                    origin: rd?.origin || (temp as any)?.origin,
                    destination: rd?.destination || (temp as any)?.destination,
                    vehicle_type_id: vehicleTypeId || undefined,
                  } as any)
                );
                setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
              }}
              cancel={() => {
                cancelDriverRequestTimers();
                setModal(true);
              }}
              chat={() => {
                const driver = (rideData as any)?.driver;
                if (driver && (driver.driver_id || driver.user_id || (driver as any)?.user?._id)) {
                  setChatModal(true);
                } else {
                  showMessage({
                    type: "warning",
                    message: "Driver information not available yet",
                  });
                }
              }}
            />
          );
        }
        return null;
    }
  }, [
    currentView?.screen,
    currentView?.data?.waiting,
    temp,
    dispatch,
    handleBack,
    setModal,
    setChatModal,
    setCurrentView,
    waitingSubtitleOverride,
    retryNow,
    cancelDriverRequestTimers,
  ]);

  useEffect(() => {
    const rideData = currentView?.data?.waiting || temp;
    const rideId = rideData?.ride_id || (rideData as any)?._id;
    const rideStatus =
      typeof rideData?.status === "string"
        ? rideData.status.toLowerCase()
        : String(rideData?.status ?? "").toLowerCase();
    const isWaiting = currentView?.screen === "WAITING";

    const shouldPoll =
      isWaiting &&
      !!rideId &&
      rideStatus !== "completed" &&
      rideStatus !== "cancelled" &&
      rideStatus !== "rejected";

    const pollMs = riderMatchedOrBeyond ? 25000 : 5000;

    if (shouldPoll) {
      pollingIntervalRef.current = setInterval(() => {
        getActiveRide();
      }, pollMs);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, [
    currentView?.screen,
    currentView?.data?.waiting?.status,
    currentView?.data?.waiting?.ride_id,
    temp?.status,
    temp?.ride_id,
    getActiveRide,
    riderMatchedOrBeyond,
  ]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // console.log(currentView?.data);
  return (
    <BottomSheet
      height={sheetHeight}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      disableBodyPanning={true}
      style={tw`px-6 py-0 rounded-t-[40px] bg-white`}
      closeOnDragDown={false}
    >
      <DriverChatModal
        data={{
          id: (() => {
            const w = currentView?.data?.waiting as any;
            const d = w?.driver;
            const td = temp?.driver as any;
            return (
              d?.user_id ||
              d?.user?._id ||
              d?.user?.id ||
              td?.user_id ||
              td?.user?._id ||
              td?.user?.id ||
              d?.driver_id ||
              td?.driver_id ||
              (temp as any)?.driver_id ||
              ''
            );
          })(),
          rideId: ((currentView?.data?.waiting as any)?.ride_id ||
                   (currentView?.data?.waiting as any)?.rideId ||
                   (temp as any)?.ride_id ||
                   (temp as any)?.rideId ||
                   '') as string,
          name: (() => {
            const w = currentView?.data?.waiting as any;
            const d = w?.driver;
            const td = temp?.driver as any;
            return (
              d?.name ||
              d?.driver_name ||
              d?.user?.name ||
              d?.user?.fullName ||
              td?.name ||
              td?.driver_name ||
              td?.user?.name ||
              'Driver'
            );
          })(),
          image: (() => {
            const w = currentView?.data?.waiting as any;
            const d = w?.driver;
            const td = temp?.driver as any;
            return (
              d?.image ||
              d?.driver_image ||
              d?.user?.profileImage ||
              d?.user?.image ||
              td?.image ||
              td?.driver_image ||
              td?.user?.profileImage ||
              td?.user?.image ||
              ''
            );
          })(),
        }}
        visible={chatModal}
        onClose={() => setChatModal(false)}
      />
      <CancelRideModal
        show={modal}
        setShow={setModal}
        rideId={cancelRideId || undefined}
        action={(data, loading, executable, showError) =>
          CancelRide(data, loading, executable, showError)
        }
        clear={() => {
          bottomSheetRef?.current?.close();
          if (clearMap) clearMap({ navigateHome: true });
          setTimeout(() => {
            dispatch(
              setAppData({
                isBooking: false,
              })
            );
          }, 200);
        }}
      />
      <View
        onLayout={onBodyLayout}
        style={{
          maxHeight: maxBodyHeight,
          width: "100%",
          flexDirection: "column",
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          style={tw.style(`absolute top-0 right-0 z-50`, {
            paddingTop: 8,
            paddingRight: 8,
          })}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close ride panel"
        >
          <View style={tw`h-[32px] w-[32px] flex-col items-center justify-center bg-black rounded-full`}>
            <AntDesign name="close" size={20} color="white" />
          </View>
        </TouchableOpacity>
        {(() => {
          const w = currentView?.data?.waiting as any;
          const screen = currentView?.screen || (w?.ride_id || w?._id ? "WAITING" : "");
          const hasRidePayload =
            (w && Object.keys(w).length > 0) || (temp && Object.keys(temp as any).length > 0);
          const view = RenderView();
          const useOwnScrollLayout = screen === "WAITING";

          if (!view) {
            return (
              <View style={tw`flex-1 items-center justify-center px-4 pt-10`}>
                <Text style={tw.style(`text-base text-[#111827] text-center`, { fontFamily: "RobotoMedium" })}>
                  {hasRidePayload
                    ? "Loading your active ride…"
                    : "We couldn't load your active ride details."}
                </Text>
                <Text style={tw.style(`text-sm text-[#6B7280] text-center mt-2`, { fontFamily: "RobotoRegular" })}>
                  Tap refresh, or cancel the ride if it’s still active.
                </Text>

                <View style={tw`w-full mt-5 gap-y-3`}>
                  <TouchableOpacity
                    onPress={() => getActiveRide()}
                    activeOpacity={0.85}
                    style={tw`w-full bg-base-green py-4 rounded-xl`}
                  >
                    <Text style={tw.style(`text-white text-center text-base`, { fontFamily: "RobotoMedium" })}>
                      Refresh active ride
                    </Text>
                  </TouchableOpacity>

                  {cancelRideId ? (
                    <TouchableOpacity
                      onPress={() => {
                        cancelDriverRequestTimers();
                        setModal(true);
                      }}
                      activeOpacity={0.85}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={tw`w-full border border-[#EF4444] py-4 rounded-xl min-h-[48px] justify-center`}
                    >
                      <Text style={tw.style(`text-[#EF4444] text-center text-base`, { fontFamily: "RobotoMedium" })}>
                        Cancel ride
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    onPress={handleBack}
                    activeOpacity={0.85}
                    style={tw`w-full bg-[#111827] py-4 rounded-xl`}
                  >
                    <Text style={tw.style(`text-white text-center text-base`, { fontFamily: "RobotoMedium" })}>
                      Close
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          if (useOwnScrollLayout) {
            return (
              <>
                {showStaleRideWarning ? (
                  <View
                    style={tw`mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5`}
                    accessibilityRole="alert"
                  >
                    <Text style={tw`text-sm leading-5 text-amber-950`}>
                      This ride may be experiencing an issue. You can cancel or contact support.
                    </Text>
                  </View>
                ) : null}
                {view}
              </>
            );
          }

          return (
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, flexGrow: 0 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
            >
              {showStaleRideWarning ? (
                <View
                  style={tw`mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5`}
                  accessibilityRole="alert"
                >
                  <Text style={tw`text-sm leading-5 text-amber-950`}>
                    This ride may be experiencing an issue. You can cancel or contact support.
                  </Text>
                </View>
              ) : null}
              {view}
            </ScrollView>
          );
        })()}
      </View>
    </BottomSheet>
  );
};

export default ActiveRideSheet;
