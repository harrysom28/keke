import {
  AppDetailsState,
  changeRideStatus,
  setAppData,
  setRideData,
  setRideUtils,
} from "@/store/AppSlice";
import {
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardEvent,
  Platform,
  StatusBar,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import { AntDesign } from "@expo/vector-icons";
import React, { useCallback, useContext, useEffect, useState, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { ConfirmPaymentView } from "@/components/find-ride/confirmPayment";
import { DriverInfoView } from "@/components/find-ride/driverInfo";
import { DriverView } from "@/components/find-ride/driver";
import { LocationView } from "@/components/find-ride/location";
import { PromoCodeView } from "@/components/find-ride/promoCode";
import { SearchView } from "@/components/find-ride/search";
import { SelectVehicleView } from "@/components/find-ride/selectVehicle";
import { SelectedView } from "@/components/find-ride/selected";
import { TVehicle } from "@/types";
import { TouchableOpacity } from "react-native-gesture-handler";
import { WalletPay } from "@/components/find-ride/walletPay";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useFocusEffect } from "expo-router";
import { getErrorMessage, showErrorMessage } from "@/utils/errorHandler";
import { requestManager } from "@/utils/requestManager";
import apiClient from "@/utils/apiClient";
import { mapUiPaymentToApi } from "@/utils/paymentMethods";
import {
  cancelUnpaidCardRide,
  collectRideCardPayment,
} from "@/utils/openRideCardPayment";

interface Props {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
  getActiveRide: () => void;
  /** Called immediately after a ride is confirmed so the parent can activate its
   *  grace-period guard and hydrate from the API payload (same shape as active-ride). */
  onRideBooked?: (confirmedRide?: Record<string, unknown> | null) => void;
  onSheetClose?: () => void;
  /** True while the find-ride bottom sheet is open — gates GPS + keyboard focus. */
  sheetOpen?: boolean;
  initialDropoff?: {
    name: string;
    lat: number | null;
    lng: number | null;
  } | null;
}

const FindRideSheet = ({ bottomSheetRef, getActiveRide, onRideBooked, onSheetClose, sheetOpen = false, initialDropoff }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const { ride } = useSelector(AppDetailsState);
  const dispatch = useDispatch();
  const screenHeight = Dimensions.get('window').height;
  const [height, setHeight] = useState<number>(Math.round(screenHeight * 0.6));
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [step, setStep] = useState<number>(1);
  const contentHeightRef = useRef(0);
  const criteriaSignatureRef = useRef("");
  const rideData = ride?.data as any;
  const pickupLat = rideData?.origin?.lat ?? rideData?.origin?.latitude ?? null;
  const pickupLng = rideData?.origin?.long ?? rideData?.origin?.lng ?? rideData?.origin?.longitude ?? null;
  const dropoffLat = rideData?.destination?.lat ?? rideData?.destination?.latitude ?? null;
  const dropoffLng = rideData?.destination?.long ?? rideData?.destination?.lng ?? rideData?.destination?.longitude ?? null;
  const vehicleTypeId = rideData?.vehicle_type_id ?? null;

  const handleContentLayout = useCallback((event: any) => {
    const measured = event?.nativeEvent?.layout?.height;
    if (!measured || measured <= 50) return;

    const capped = Math.max(200, Math.min(Math.round(measured + 48), Math.round(screenHeight * 0.92)));
    if (Math.abs(capped - contentHeightRef.current) > 8) {
      contentHeightRef.current = capped;
      setHeight(capped);
    }
  }, [screenHeight]);

  const clearDropoffDraft = useCallback(() => {
    dispatch(
      setRideData({
        destination: { name: "", lat: "", long: "" },
        driver_id: "",
      } as any)
    );
    dispatch(setRideUtils({ drivers: [] }));
  }, [dispatch]);

  const handleSheetClosed = useCallback(() => {
    Keyboard.dismiss();
    contentHeightRef.current = 0;
    setHeight(Math.round(screenHeight * 0.6));
    setStep(1);
    dispatch(setAppData({ isBooking: false }));
    clearDropoffDraft();
    onSheetClose?.();
  }, [clearDropoffDraft, dispatch, onSheetClose, screenHeight]);

  const handleBack = useCallback(() => {
    console.log('🔙 handleBack called, current step:', step);
    
    if (step > 1) {
      // For decimal steps (like 4.1), go back to the integer step (4)
      if (!Number.isInteger(step)) {
        const integerStep = Math.floor(step);
        console.log('🔙 Going back from decimal step', step, 'to integer step', integerStep);
        setStep(integerStep);
      } else {
        // For integer steps, go back by 1
        const newStep = step - 1;
        console.log('🔙 Going back from step', step, 'to step', newStep);
        setStep(newStep);
      }
    } else {
      // On first step, close the modal — clear dropoff immediately so map/route update without waiting for sheet animation
      console.log('🔙 Closing modal from step 1');
      setStep(1);
      clearDropoffDraft();
      bottomSheetRef?.current?.close();
    }
  }, [step, bottomSheetRef, clearDropoffDraft]);

  useEffect(() => {
    contentHeightRef.current = 0;
    setHeight(Math.round(screenHeight * 0.6));
  }, [step, ride.status, screenHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const signature = [
      pickupLat ?? "",
      pickupLng ?? "",
      dropoffLat ?? "",
      dropoffLng ?? "",
      vehicleTypeId ?? "",
    ].join(":");

    if (signature === criteriaSignatureRef.current) {
      return;
    }

    criteriaSignatureRef.current = signature;
    dispatch(setRideUtils({ drivers: [] }));
    dispatch(setRideData({ driver_id: "" } as any));
  }, [dispatch, dropoffLat, dropoffLng, pickupLat, pickupLng, vehicleTypeId]);

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
    }, [step])
  );

  const createRide = async (
    loading: React.Dispatch<React.SetStateAction<boolean>>,
    payment_type = "",
    /** Pass explicitly when booking from driver picker — Redux may not have flushed yet. */
    preferredDriverId?: string
  ) => {
    loading(true);
    
    try {
      // Transform frontend data structure to match backend validation
      const finalPaymentType =
        payment_type.length > 0 ? payment_type : (rideData?.payment_type || "Cash");

      const paymentMethod = mapUiPaymentToApi(finalPaymentType);
      
      // Log ride data for debugging
      console.log('🔍 Ride data before validation:', {
        hasOrigin: !!rideData?.origin,
        hasDestination: !!rideData?.destination,
        origin: rideData?.origin,
        destination: rideData?.destination,
        fullRideData: rideData,
      });

      // Transform data to backend format
      const pickupName = rideData?.origin?.name || '';
      const pickupAddress = rideData?.origin?.formatted_address || rideData?.origin?.address || rideData?.origin?.name || '';
      
      const dropoffName = rideData?.destination?.name || '';
      const dropoffAddress = rideData?.destination?.formatted_address || rideData?.destination?.address || rideData?.destination?.name || '';
      
      // Validate coordinates - must be valid GPS coordinates (not 0,0 or default values)
      const pickupLat = parseFloat(String(rideData?.origin?.lat || rideData?.origin?.latitude || '0'));
      const pickupLng = parseFloat(String(rideData?.origin?.long || rideData?.origin?.longitude || '0'));
      const dropoffLat = parseFloat(String(rideData?.destination?.lat || rideData?.destination?.latitude || '0'));
      const dropoffLng = parseFloat(String(rideData?.destination?.long || rideData?.destination?.longitude || '0'));

      console.log('📍 Parsed coordinates:', {
        pickup: { lat: pickupLat, lng: pickupLng },
        dropoff: { lat: dropoffLat, lng: dropoffLng },
      });

      // Validate coordinates are valid GPS coordinates
      if (pickupLat === 0 || pickupLng === 0 || isNaN(pickupLat) || isNaN(pickupLng)) {
        console.error('❌ Invalid pickup coordinates:', { pickupLat, pickupLng, origin: rideData?.origin });
        showMessage({
          type: "warning",
          message: "Please select a valid pickup location first.",
        });
        throw new Error('Invalid pickup location coordinates. Please select a valid pickup location.');
      }
      
      if (!rideData?.destination) {
        console.error('❌ Missing destination in ride data');
        showMessage({
          type: "warning",
          message: "Please select a destination location first.",
        });
        throw new Error('Destination location is required. Please go back and select a destination.');
      }
      
      if (dropoffLat === 0 || dropoffLng === 0 || isNaN(dropoffLat) || isNaN(dropoffLng)) {
        console.error('❌ Invalid dropoff coordinates:', { dropoffLat, dropoffLng, destination: rideData?.destination });
        showMessage({
          type: "warning",
          message: "Please select a valid destination location first.",
        });
        throw new Error('Invalid dropoff location coordinates. Please select a valid destination.');
      }
      if (Math.abs(pickupLat) > 90 || Math.abs(pickupLng) > 180) {
        throw new Error('Pickup coordinates are out of valid range.');
      }
      if (Math.abs(dropoffLat) > 90 || Math.abs(dropoffLng) > 180) {
        throw new Error('Dropoff coordinates are out of valid range.');
      }

      console.log('📍 Creating ride with exact GPS coordinates:', {
        pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress },
        dropoff: { lat: dropoffLat, lng: dropoffLng, address: dropoffAddress },
      });

      const driverIdForRequest =
        (typeof preferredDriverId === 'string' && preferredDriverId.trim()) ||
        (typeof rideData?.driver_id === 'string' && String(rideData.driver_id).trim()) ||
        '';

      const requestData: any = {
        pickupLocation: {
          lat: pickupLat,
          lng: pickupLng,
          name: pickupName,
          address: pickupAddress,
        },
        dropoffLocation: {
          lat: dropoffLat,
          lng: dropoffLng,
          name: dropoffName,
          address: dropoffAddress,
        },
        vehicleTypeId: rideData?.vehicle_type_id || '',
        paymentMethod: paymentMethod,
        promoCode: rideData?.promo_code || null,
        ...(driverIdForRequest ? { driverId: driverIdForRequest } : {}),
      };

      // Add scheduledAt if provided
      if (rideData?.scheduledAt || rideData?.scheduled_at) {
        const scheduledTime = rideData?.scheduledAt || rideData?.scheduled_at;
        requestData.scheduledAt = scheduledTime;
        console.log('📅 Scheduling ride for:', scheduledTime);
      }

      console.log('📤 Creating ride:', requestData);

      console.log(
        'Submitting ride request with driverId:',
        driverIdForRequest || 'none - will broadcast to nearby drivers'
      );

      // Use apiClient instead of axios for automatic token refresh
      // Use 'booking/confirm-ride' which is the correct endpoint (alias for request-ride)
      const response = await apiClient.post('booking/confirm-ride', requestData);
      
      console.log('✅ Ride created successfully:', response.data?.data);

      const confirmedRide = response.data?.data?.ride ?? null;
      const paymentRequired = Boolean(response.data?.data?.payment_required);
      const rideIdForPay = String(
        confirmedRide?.ride_id || confirmedRide?._id || confirmedRide?.id || ""
      ).trim();
      const isScheduledRide = Boolean(
        confirmedRide?.is_scheduled ||
          confirmedRide?.scheduled_at ||
          requestData.scheduledAt
      );

      // Card: charge via Paystack before entering waiting / matching UI.
      // Wallet and cash skip this block entirely.
      if (paymentRequired && rideIdForPay) {
        const paid = await collectRideCardPayment(rideIdForPay, showMessage);
        if (!paid) {
          await cancelUnpaidCardRide(rideIdForPay, isScheduledRide);
          showMessage({
            type: "warning",
            message: "Card payment was not completed. Ride was cancelled.",
            duration: 4500,
          });
          return;
        }
      }

      // Grace period + immediate hydration from confirm response (GET active-ride can lag).
      onRideBooked?.(confirmedRide);

      bottomSheetRef?.current?.close();

      // Clear booking draft only — do NOT set isBooking:false here: that triggers Home's
      // effect that wipes the map before temp/waiting exist. Active ride keeps isBooking true.
      dispatch(
        setRideData({
          origin: { name: "", lat: "", long: "" },
          destination: { name: "", lat: "", long: "" },
          driver_id: "",
          vehicle_type_id: "",
          payment_type: "",
          promo_code: "",
        } as any)
      );
      dispatch(setRideUtils({ drivers: [] }));

      getActiveRide();
      
      showMessage({ 
        type: "success", 
        message: paymentRequired
          ? "Payment confirmed. Finding a driver…"
          : "Ride created successfully" 
      });
      
      // Reset step
      setStep(1);
      
    } catch (err: any) {
      // Handle 409 - Active ride already exists
      if (err?.response?.status === 409 || err?.status === 409) {
        console.log('🔄 Active ride exists, fetching it...');
        getActiveRide();
        showMessage({
          type: "info",
          message: "You already have an active ride. Opening it now…",
        });
        
        // Close modal
        bottomSheetRef?.current?.close();
        // Important: don't clear ride state; we want to resume the existing trip.
        dispatch(setAppData({ isBooking: false }));
        setStep(1);
        return;
      }

      const respBody = err?.response?.data;
      if (respBody?.code === 'INSUFFICIENT_BALANCE') {
        showMessage({
          type: 'warning',
          message:
            'Insufficient wallet balance. Switch to Cash in payment options or top up your wallet.',
          duration: 5500,
        });
        return;
      }

      console.error('❌ Create ride error:', err?.response?.data || err?.message);

      // Handle validation errors
      const validationErrors = err?.response?.data?.error?.errors || 
                              err?.response?.data?.errors;
      
      if (validationErrors) {
        let errorMessages: string[] = [];
        
        if (Array.isArray(validationErrors)) {
          errorMessages = validationErrors.map((e: any) => 
            typeof e === 'string' ? e : (e?.msg || e?.message || 'Validation error')
          );
        } else if (typeof validationErrors === 'object') {
          Object.entries(validationErrors).forEach(([field, errors]: [string, any]) => {
            if (Array.isArray(errors)) {
              errors.forEach((errMsg: any) => {
                const msg = typeof errMsg === 'string' ? errMsg : (errMsg?.msg || errMsg?.message || 'Validation error');
                errorMessages.push(`${field}: ${msg}`);
              });
            } else if (typeof errors === 'string') {
              errorMessages.push(`${field}: ${errors}`);
            }
          });
        }
        
        const errorMessage = errorMessages.length > 0 
          ? errorMessages.join(', ') 
          : 'Validation failed. Please check your input.';
        
        showMessage({
          type: "danger",
          message: errorMessage,
        });
        return;
      }
      
      // Handle other errors using centralized error handler
      showErrorMessage(err, {
        fallback: 'Failed to create ride. Please try again.',
        type: 'danger',
        duration: 5000,
      });
      
    } finally {
      loading(false);
    }
  };

  const RenderView = useCallback(() => {
    switch (step) {
      case 1:
        // Location selection
        return (
          <LocationView
            action={() => setStep(2)}
            back={() => handleBack()}
            initialDropoff={initialDropoff}
            locationSheetActive={sheetOpen}
          />
        );
        
      case 2:
        // Vehicle selection with payment and promo
        return (
          <SelectVehicleView
            onHeightChange={(measuredHeight) => {
              if (measuredHeight && measuredHeight > 0 && isFinite(measuredHeight)) {
                // measuredHeight is already in pixels; add buffer so Request Ride button is fully visible
                const heightValue = Math.round(measuredHeight) + 40;
                // Clamp between 200px and 95% of screen to show all content
                const clampedHeight = Math.max(200, Math.min(heightValue, Math.round(screenHeight * 0.95)));
                contentHeightRef.current = clampedHeight;
                setHeight(clampedHeight);
                console.log('📐 Modal height updated:', {
                  measuredHeight,
                  clampedHeight,
                  screenHeight,
                  percentage: `${((clampedHeight / screenHeight) * 100).toFixed(1)}%`
                });
              } else {
                console.warn('⚠️ Invalid height measured:', measuredHeight);
              }
            }}
            action={(vehicle: TVehicle, paymentMethod: string, promoCode?: string) => {
              // Extract pricing data
              const vehicleWithPricing = vehicle as any;
              const cost = vehicleWithPricing?.cost;
              const distance = vehicleWithPricing?.distance;
              const duration = vehicleWithPricing?.duration;
              
              console.log('🚗 Vehicle selected:', {
                id: vehicle?.vehicle_id,
                type: vehicle?.vehicle_type,
                cost,
                payment: paymentMethod,
                promo: promoCode,
              });
              
              // Store vehicle and pricing data
              dispatch(setRideUtils({ 
                vehicle,
                distanceTime: {
                  cost: cost?.toString() || cost || '0',
                  distance: typeof distance === 'object' ? distance : (distance || { text: '0 km', value: 0, unit: 'km' }),
                  duration: typeof duration === 'object' ? duration : (duration || { text: '0 min', value: 0, unit: 'minutes' }),
                }
              }));
              
              dispatch(
                setRideData({
                  vehicle_type_id: vehicle?.vehicle_id?.toString(),
                  payment_type: paymentMethod,
                  promo_code: promoCode || "",
                  // Note: cost is stored in distanceTime, not directly in ride data
                } as any)
              );
              
              dispatch(changeRideStatus(true));
              
              // Move to driver selection
              setStep(3);
            }}
            back={() => handleBack()}
          />
        );
        
      case 3:
        // Driver selection and search
        return (
          <DriverView
            action={() => {
              // Optional: View driver details
            }}
            request={(driverId: string, loading: React.Dispatch<React.SetStateAction<boolean>>) => {
              console.log('🚗 Requesting ride with driver:', driverId);
              dispatch(setRideData({ driver_id: driverId }));
              createRide(loading, rideData?.payment_type || "Cash", driverId);
            }}
            onChangeLocation={() => setStep(1)}
            onHeightChange={(measuredHeight) => {
              if (measuredHeight && measuredHeight > 0 && isFinite(measuredHeight)) {
                // measuredHeight is already in pixels, use it directly
                const heightValue = Math.round(measuredHeight);
                // Clamp between 200px and 95% of screen
                const clampedHeight = Math.max(200, Math.min(heightValue, Math.round(screenHeight * 0.95)));
                contentHeightRef.current = clampedHeight;
                setHeight(clampedHeight);
                console.log('📐 Driver modal height updated:', { 
                  measuredHeight, 
                  clampedHeight, 
                  screenHeight 
                });
              } else {
                console.warn('⚠️ Invalid height measured for driver view:', measuredHeight);
              }
            }}
          />
        );
        
      default:
        return null;
    }
  }, [step, handleBack, dispatch, bottomSheetRef, ride, sheetOpen, initialDropoff]);

  // Ensure height is always a valid number (pixels)
  const getValidHeight = (): number => {
    let heightValue: number;
    
    // Height should now always be a number, but handle edge cases
    if (typeof height === 'number') {
      heightValue = height;
    } else {
      // Fallback if somehow it's not a number
      heightValue = 600;
    }
    
    // Validate the final value
    if (isNaN(heightValue) || !isFinite(heightValue) || heightValue <= 0) {
      heightValue = 600;
    }
    
    // Ensure it's a reasonable value (between 200px and screen height)
    heightValue = Math.max(200, Math.min(heightValue, screenHeight));
    if (keyboardHeight > 0) {
      heightValue = Math.min(
        heightValue + keyboardHeight,
        Math.round(screenHeight * 0.98)
      );
    }
    return Math.round(heightValue);
  };

  // Don't render the BottomSheet at all if there's no valid content
  const content = useMemo(() => RenderView(), [RenderView]);
  
  // If there's no content, don't render anything
  if (!content) return null;

  const validHeight = getValidHeight();

  if (!validHeight || validHeight <= 0 || isNaN(validHeight) || !isFinite(validHeight)) {
    const fallbackHeight = 600;
    return (
      <BottomSheet
        height={fallbackHeight}
        ref={bottomSheetRef}
        animationType="spring"
        backdropMaskColor="#19191900"
        openDuration={1000}
        closeDuration={1000}
        disableKeyboardHandling={false}
        // Android: PanResponder on the sheet body steals/conflicts with TextInput & ScrollView touches
        // on some devices (e.g. Samsung). Drag-to-close still works via the handle bar.
        disableBodyPanning={true}
        style={tw.style(`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`, {
          position: 'relative',
        })}
        closeOnDragDown={true}
        onClose={handleSheetClosed}
      >
        {/* X Button at top right edge of card */}
        <View style={tw.style(`absolute -top-1 right-1 z-50`, {
          paddingTop: 0,
          paddingRight: 0,
        })}>
          <TouchableOpacity 
            onPress={handleBack}
            style={tw`h-[32px] w-[32px] flex-col items-center justify-center bg-black rounded-full`}
            activeOpacity={0.7}
          >
            <AntDesign name="close" size={20} color="white" />
          </TouchableOpacity>
        </View>
        <View onLayout={handleContentLayout}>
          {content}
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      height={validHeight}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      closeDuration={1000}
      disableKeyboardHandling={false}
      disableBodyPanning={true}
      style={tw.style(`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`, {
        position: 'relative',
      })}
      closeOnDragDown={true}
      onClose={handleSheetClosed}
    >
      {/* X Button at top right edge of card */}
      <View style={tw.style(`absolute -top-1 right-1 z-50`, {
        paddingTop: 0,
        paddingRight: 0,
      })}>
        <TouchableOpacity 
          onPress={handleBack}
          style={tw`h-[32px] w-[32px] flex-col items-center justify-center bg-black rounded-full`}
          activeOpacity={0.7}
        >
          <AntDesign name="close" size={20} color="white" />
        </TouchableOpacity>
      </View>
      <View onLayout={handleContentLayout}>
        {content}
      </View>
    </BottomSheet>
  );
};

export default FindRideSheet;
