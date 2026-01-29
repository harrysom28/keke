import { ASSIGN_NEW_DRIVER, CANCEL_RIDE } from "@/constants";
import { BackHandler, StatusBar, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { AntDesign } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { setAppData, setRideData, setRideUtils } from "@/store/AppSlice";

import CancelRideModal from "@/components/find-ride/cancelRide";
import DriverChatModal from "@/shared/modal/driverChat";
import { DriverInfoView } from "@/components/find-ride/driverInfo";
import { DriverView } from "@/components/find-ride/driver";
import { IARide } from "../home";
import ReviewSheet from "@/components/find-ride/feedbackReview";
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
}

const ActiveRideSheet = ({
  bottomSheetRef,
  currentView,
  setCurrentView,
  getActiveRide,
  temp,
  clearMap,
}: Props) => {
  const dispatch = useDispatch();
  const [modal, setModal] = useState<boolean>(false);
  const [chatModal, setChatModal] = useState<boolean>(false);
  const [height, setHeight] = useState<string>("60%");
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const CancelRide = (
    data: { reason: string; description: string },
    loading: React.Dispatch<React.SetStateAction<boolean>>,
    executable: () => void,
    showError: (text: string) => void
  ) => {
    loading(true);
    const rideId = currentView?.data?.waiting?.ride_id || currentView?.data?.waiting?.rideId || temp?.ride_id || temp?.rideId;
    const reason = data.description ? `${data.reason}: ${data.description}` : data.reason;
    
    // Use apiClient instead of axios for automatic token refresh
    apiClient
      .post('booking/cancel-ride', { rideId, reason })
      .then(({ data }) => {
        console.log(data);
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
        console.log(err?.response?.data);
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
    driver_id: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    loading(true);
    const rideId = currentView?.data?.waiting?.ride_id || 
                   currentView?.data?.waiting?.rideId || 
                   temp?.ride_id || 
                   temp?.rideId;
    
    if (!rideId) {
      loading(false);
      showMessage({
        type: "danger",
        message: "Ride ID not found. Please try again.",
      });
      return;
    }

    // Use apiClient instead of axios for automatic token refresh
    apiClient
      .post('booking/ride/assign-new-driver', {
        rideId: rideId,
        reason: 'Requested new driver'
      })
      .then(({ data }) => {
        console.log('✅ New driver assigned:', data);
        showMessage({ type: "success", message: data?.message || 'New driver assigned successfully' });
        
        // Refresh active ride to get updated driver info
        getActiveRide();
        
        // Don't close the sheet, just update the view
        setCurrentView((prev) => ({ 
          ...prev, 
          screen: "WAITING",
          data: {
            ...prev.data,
            waiting: data?.data?.ride || prev.data?.waiting
          }
        }));
      })
      .catch((err) => {
        console.log('❌ Assign new driver error:', err?.response?.data);
        let errorMessage = 'Failed to assign new driver. Please try again.';

        if (err?.response?.data?.message) {
          errorMessage = typeof err.response.data.message === 'string' 
            ? err.response.data.message 
            : (err.response.data.message?.message || errorMessage);
        } else if (err?.response?.data?.error) {
          errorMessage = typeof err.response.data.error === 'string' 
            ? err.response.data.error 
            : (err.response.data.error?.message || errorMessage);
        }

        showMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => loading(false));
  };

  const modifyHeight = useCallback(() => {
    const screen = currentView?.screen || (temp?.ride_id ? "WAITING" : "");
    if (screen === "WAITING") {
      setHeight("50%"); // Compact height for waiting view
    } else if (screen === "REQUEST-CHANGE") {
      setHeight("75%");
    } else if (screen === "REVIEW") {
      setHeight("88%");
    } else if (screen === "SEARCH") {
      setHeight("60%");
    } else if (screen === "DRIVERS") {
      setHeight("88%");
    } else if (screen === "DRIVER") {
      setHeight("90%");
    } else if (temp?.ride_id) {
      // If we have ride data but no screen, default to WAITING height
      setHeight("50%");
    }
  }, [currentView?.screen, temp?.ride_id]);

  useEffect(() => {
    modifyHeight();
  }, [currentView?.screen]);

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
    const rideId = currentView?.data?.waiting?.ride_id || 
                   currentView?.data?.waiting?._id || 
                   temp?.ride_id || 
                   temp?._id;
    const screen = currentView?.screen || (rideId ? "WAITING" : "");
    
    // Get the ride data - prioritize currentView, then temp
    const rideData = currentView?.data?.waiting && Object.keys(currentView.data.waiting).length > 0
      ? currentView.data.waiting
      : (temp && Object.keys(temp).length > 0 ? temp : {});
    
    console.log('🎨 RenderView - screen:', screen, 'rideId:', rideId, 'hasData:', Object.keys(rideData).length > 0);
    
    switch (screen) {
      case "WAITING":
        return (
          <WaitingView
            key={rideId || 'waiting'}
            ride={rideData}
            info={(driver_id) => {
              console.log(driver_id);
              dispatch(
                setRideUtils({
                  driver_id,
                })
              );
              setCurrentView((prev) => ({ ...prev, screen: "DRIVER" }));
            }}
            action={() => {
              // Preserve all necessary ride data for new driver search
              const vehicleTypeId = rideData?.vehicle_id || 
                                   rideData?.vehicle_type_id || 
                                   temp?.vehicle_id || 
                                   temp?.vehicle_type_id;
              
              dispatch(
                setRideData({ 
                  origin: rideData?.origin || temp?.origin,
                  destination: rideData?.destination || temp?.destination,
                  vehicle_type_id: vehicleTypeId || undefined,
                })
              );
              setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
            }}
            cancel={() => setModal(true)}
            chat={() => {
              const driver = rideData?.driver || temp?.driver;
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
          console.log('🎨 Default case - showing WAITING with ride data');
          return (
            <WaitingView
              key={rideId || 'waiting-fallback'}
              ride={rideData}
              info={(driver_id) => {
                console.log(driver_id);
                dispatch(setRideUtils({ driver_id }));
                setCurrentView((prev) => ({ ...prev, screen: "DRIVER" }));
              }}
              action={() => {
                // Preserve all necessary ride data for new driver search
                const vehicleTypeId = rideData?.vehicle_id || 
                                     rideData?.vehicle_type_id || 
                                     temp?.vehicle_id || 
                                     temp?.vehicle_type_id;
                
                dispatch(setRideData({ 
                  origin: rideData?.origin || temp?.origin,
                  destination: rideData?.destination || temp?.destination,
                  vehicle_type_id: vehicleTypeId || undefined,
                }));
                setCurrentView((prev) => ({ ...prev, screen: "SEARCH" }));
              }}
              cancel={() => setModal(true)}
              chat={() => {
                const driver = rideData?.driver;
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
        console.log('🎨 Default case - no ride data, returning null');
        return null;
    }
  }, [currentView?.screen, currentView?.data?.waiting, temp, dispatch, handleBack, setModal, setChatModal, setCurrentView]);

  // Poll for ride status updates throughout the entire ride lifecycle
  useEffect(() => {
    const rideData = currentView?.data?.waiting || temp;
    const rideId = rideData?.ride_id || rideData?._id;
    const rideStatus = rideData?.status;
    const isWaiting = currentView?.screen === "WAITING";
    
    // Continue polling if:
    // 1. We're in WAITING screen AND
    // 2. We have a ride ID AND
    // 3. Ride is not completed or cancelled
    const shouldPoll = isWaiting && 
                      rideId && 
                      rideStatus !== 'completed' && 
                      rideStatus !== 'cancelled';

    if (shouldPoll) {
      console.log('🔄 Starting polling for ride status updates...', { rideId, status: rideStatus });
      
      // Poll every 3 seconds to check for status updates (accepted -> arrived -> in-progress -> completed)
      pollingIntervalRef.current = setInterval(() => {
        console.log('🔄 Polling for ride status update...', { rideId, currentStatus: rideStatus });
        getActiveRide();
      }, 3000); // Poll every 3 seconds

      return () => {
        if (pollingIntervalRef.current) {
          console.log('🛑 Stopping polling for ride status updates');
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    } else {
      // Stop polling if ride is completed/cancelled or no ride ID
      if (pollingIntervalRef.current) {
        console.log('🛑 Stopping polling - ride completed/cancelled or no active ride', { 
          rideId, 
          status: rideStatus,
          isWaiting 
        });
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
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
      height={height}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={true}
      style={tw`px-6 py-0 rounded-t-[40px] bg-white`}
      closeOnDragDown={false}
    >
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
      <DriverChatModal
        data={{
          // Use user_id for display
          id: (currentView?.data?.waiting?.driver?.user_id || 
               (currentView?.data?.waiting?.driver as any)?.user?._id ||
               (currentView?.data?.waiting?.driver as any)?.user?.id ||
               temp?.driver?.user_id ||
               (temp?.driver as any)?.user?._id ||
               (temp?.driver as any)?.user?.id ||
               // Fallback to driver_id if user_id not available (shouldn't happen but handle gracefully)
               currentView?.data?.waiting?.driver?.driver_id || 
               temp?.driver?.driver_id ||
               temp?.driver_id ||
               '') as string,
          // Use rideId for API calls
          rideId: (currentView?.data?.waiting?.ride_id || 
                   currentView?.data?.waiting?.rideId || 
                   temp?.ride_id || 
                   temp?.rideId || 
                   '') as string,
          name: (currentView?.data?.waiting?.driver?.name ||
                 currentView?.data?.waiting?.driver?.driver_name ||
                 (currentView?.data?.waiting?.driver as any)?.user?.name ||
                 (currentView?.data?.waiting?.driver as any)?.user?.fullName ||
                 temp?.driver?.name ||
                 temp?.driver?.driver_name ||
                 (temp?.driver as any)?.user?.name ||
                 'Driver') as string,
          image: (currentView?.data?.waiting?.driver?.image ||
                  currentView?.data?.waiting?.driver?.driver_image ||
                  (currentView?.data?.waiting?.driver as any)?.user?.profileImage ||
                  (currentView?.data?.waiting?.driver as any)?.user?.image ||
                  temp?.driver?.image ||
                  temp?.driver?.driver_image ||
                  (temp?.driver as any)?.user?.profileImage ||
                  (temp?.driver as any)?.user?.image ||
                  '') as string,
        }}
        visible={chatModal}
        onClose={() => setChatModal(false)}
      />
      <CancelRideModal
        show={modal}
        setShow={setModal}
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
      {RenderView() || (
        <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Text style={{ fontSize: 16, color: '#666' }}>Loading...</Text>
        </View>
      )}
    </BottomSheet>
  );
};

export default ActiveRideSheet;
