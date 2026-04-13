import { BackHandler, Dimensions, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { AntDesign } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setAppData, setRideData, setRideUtils } from "@/store/AppSlice";
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
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";
import { useFocusEffect } from "expo-router";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  currentView: IARide;
  setCurrentView: React.Dispatch<React.SetStateAction<IARide>>;
  getActiveRide: () => void;
  temp: TRide;
  clearMap?: () => void;
  /** Increment (e.g. from notification deep link) to open the driver chat modal. */
  chatOpenSignal?: number;
}

const ActiveRideSheet = ({
  bottomSheetRef,
  currentView,
  setCurrentView,
  getActiveRide,
  temp,
  clearMap,
  chatOpenSignal = 0,
}: Props) => {
  const dispatch = useDispatch();
  const screenHeight = Dimensions.get("window").height;
  const [modal, setModal] = useState<boolean>(false);
  const [chatModal, setChatModal] = useState<boolean>(false);
  /** Measured content-derived height; null until layout or child reports a stable value */
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const lastAppliedSheetHeightRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChatKickRef = useRef(0);

  const rideDataForWaiting = useMemo(() => {
    if (currentView?.data?.waiting && Object.keys(currentView.data.waiting).length > 0) {
      return currentView.data.waiting;
    }
    if (temp && Object.keys(temp).length > 0) {
      return temp;
    }
    return {} as TRide;
  }, [currentView?.data?.waiting, temp]);

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

  const estimatedSheetHeight = useMemo(() => {
    const rd = rideDataForWaiting as any;
    let h = 120;
    const hasDriver =
      rd?.driver && typeof rd.driver === "object" && Object.keys(rd.driver).length > 0;

    switch (resolvedScreenForLayout) {
      case "WAITING":
        h += 320;
        if (hasDriver) h += 140;
        if (showStaleRideWarning) h += 72;
        break;
      case "SEARCH":
        h += 300;
        break;
      case "DRIVERS":
        h += 420;
        break;
      case "DRIVER":
        h += 280;
        break;
      case "SUMMARY":
        h += 520;
        break;
      case "REVIEW":
        h += 340;
        break;
      default:
        h += resolvedScreenForLayout ? 360 : 200;
    }
    return h;
  }, [resolvedScreenForLayout, rideDataForWaiting, showStaleRideWarning]);

  const sheetHeight = useMemo(() => {
    const minH = screenHeight * 0.3;
    const maxH = screenHeight * 0.9;
    const target = measuredHeight ?? estimatedSheetHeight;
    return Math.max(minH, Math.min(target, maxH));
  }, [screenHeight, measuredHeight, estimatedSheetHeight]);

  const applySheetHeight = useCallback(
    (value: number) => {
      if (!value || !isFinite(value)) return;
      const capped = Math.min(value, screenHeight * 0.92);
      const last = lastAppliedSheetHeightRef.current;
      if (last != null && Math.abs(capped - last) <= 30) return;
      lastAppliedSheetHeightRef.current = capped;
      setMeasuredHeight(capped);
    },
    [screenHeight]
  );

  const handleContentLayout = useCallback(
    (event: any) => {
      const measured = event?.nativeEvent?.layout?.height;
      if (!measured || measured <= 50) return;
      applySheetHeight(measured + 48);
    },
    [applySheetHeight]
  );

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
  };

  const rideIdForHook =
    rideDataForWaiting?.ride_id ||
    (rideDataForWaiting as any)?._id ||
    (rideDataForWaiting as any)?.rideId;

  const isRideAcceptedByDriver = !!(
    (rideDataForWaiting as any)?.accepted_by_driver || (rideDataForWaiting as any)?.acceptedByDriver
  );

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
      } catch (err: any) {
        let errorMessage = "Failed to assign new driver. Please try again.";
        if (err?.response?.data?.message) {
          errorMessage =
            typeof err.response.data.message === "string"
              ? err.response.data.message
              : err.response.data.message?.message || errorMessage;
        } else if (err?.response?.data?.error) {
          errorMessage =
            typeof err.response.data.error === "string"
              ? err.response.data.error
              : err.response.data.error?.message || errorMessage;
        }
        showMessage({
          type: "danger",
          message: errorMessage,
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

  const CancelRide = (
    data: { reason: string; description: string },
    loading: React.Dispatch<React.SetStateAction<boolean>>,
    executable: () => void,
    showError: (text: string) => void
  ) => {
    loading(true);
    const rideId =
      (currentView?.data?.waiting as any)?.ride_id ||
      (currentView?.data?.waiting as any)?.rideId ||
      (temp as any)?.ride_id ||
      (temp as any)?.rideId;
    const reason = data.description ? `${data.reason}: ${data.description}` : data.reason;
    
    // Use apiClient instead of axios for automatic token refresh
    apiClient
      .post('booking/cancel-ride', { rideId, reason })
      .then(({ data }) => {
        executable();
        // Clear ride state completely - this handles map, markers, polylines, and all state
        if (clearMap) {
          clearMap();
        }
        handleBack();
        // Refresh to ensure backend state is synced
        getActiveRide();
      })
      .catch((err) => {
        let errorMessage = 'An unexpected error occurred.';

        if (err?.response?.data?.message) {
          errorMessage = typeof err.response.data.message === 'string' 
            ? err.response.data.message 
            : (err.response.data.message?.message || errorMessage);
        } else if (err?.response?.data?.error) {
          errorMessage = typeof err.response.data.error === 'string' 
            ? err.response.data.error 
            : (err.response.data.error?.message || errorMessage);
        }

        showError(errorMessage);
      })
      .finally(() => loading(false));
  };

  const ReassignDriver = (
    _driver_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    reassignDriver("Requested new driver", loading);
  };

  useEffect(() => {
    lastAppliedSheetHeightRef.current = null;
    setMeasuredHeight(null);
  }, [currentView?.screen, temp?.ride_id]);

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
            ride={temp as any}
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
            onHeightChange={applySheetHeight}
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
    applySheetHeight,
  ]);

  // Fallback poll for ride status (Pusher in home.tsx is primary; poll rarely to reduce load)
  const POLL_INTERVAL_MS = 25000; // backup when Pusher misses an event
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

    if (shouldPoll) {
      pollingIntervalRef.current = setInterval(() => {
        getActiveRide();
      }, POLL_INTERVAL_MS);

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
  }, [currentView?.screen, currentView?.data?.waiting?.status, currentView?.data?.waiting?.ride_id, temp?.status, temp?.ride_id, getActiveRide]);

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
        rideId={
          rideIdForHook ||
          (currentView?.data?.waiting as any)?.ride_id ||
          (currentView?.data?.waiting as any)?.rideId ||
          (temp as any)?.ride_id ||
          (temp as any)?.rideId
        }
        action={(data, loading, executable, showError) =>
          CancelRide(data, loading, executable, showError)
        }
        clear={() => {
          bottomSheetRef?.current?.close();
          setTimeout(() => {
            dispatch(
              setAppData({
                isBooking: false,
              })
            );
          }, 200);
        }}
      />
      <View onLayout={handleContentLayout}>
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
        {/* X Button at top right edge of modal */}
        <TouchableOpacity
          onPress={handleBack}
          style={tw.style(`absolute top-0 right-0 z-50`, {
            paddingTop: 8,
            paddingRight: 8,
          })}
          activeOpacity={0.7}
        >
          <View style={tw`h-[32px] w-[32px] flex-col items-center justify-center bg-black rounded-full`}>
            <AntDesign name="close" size={20} color="white" />
          </View>
        </TouchableOpacity>
        {RenderView() || (
          <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Text style={{ fontSize: 16, color: '#666' }}>Loading...</Text>
          </View>
        )}
      </View>
    </BottomSheet>
  );
};

export default ActiveRideSheet;
