import { ActivityIndicator, Image, Pressable, Text, View, StyleSheet, Dimensions, TouchableOpacity, TextInput, ScrollView } from "react-native";
import React, { useContext, useEffect, useState, useRef } from "react";

import { AppContext } from "@/app/context";
import { FareBreakdownModal } from "./fareBreakdown";
import { AppDetailsState, setRideData, setRideUtils } from "@/store/AppSlice";
import { TVehicle } from "@/types";
import { VEHICLE_TYPES, APPLY_CODE } from "@/constants";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { getVehicleImage, getVehicleImageSource } from "@/utils/vehicleImages";
import { useSelector, useDispatch } from "react-redux";
import apiClient from "@/utils/apiClient";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Path, Svg } from "react-native-svg";
import { requestManager } from "@/utils/requestManager";

interface Props {
  action: (vehicle: TVehicle, paymentMethod: string, promoCode?: string) => void;
  back?: () => void;
  onHeightChange?: (height: number) => void;
}

interface VehicleWithPricing extends TVehicle {
  cost?: number | null;
  distance?: { text: string; value: number; unit: string } | string;
  duration?: { text: string; value: number; unit: string } | string;
  capacity?: number;
  description?: string;
  pickupTime?: string;
  name?: string;
  display_name?: string;
}

// Default vehicle types to use when API returns empty
const DEFAULT_VEHICLES: TVehicle[] = [
  {
    vehicle_id: 1,
    vehicle_type: "Keke",
    vehicle_type_image: "",
  },
  {
    vehicle_id: 2,
    vehicle_type: "Bike",
    vehicle_type_image: "",
  },
  {
    vehicle_id: 3,
    vehicle_type: "Car",
    vehicle_type_image: "",
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Payment mode icons and data - Wallet is always available, Cash is optional
const PaymentModes = {
  Wallet: {
    text: "Wallet",
    icon: () => (
      <Svg width="33" height="35" viewBox="0 0 33 35" fill="none">
        <Path
          d="M28.1875 20.407C29.3266 20.407 30.25 19.4836 30.25 18.3445C30.25 17.2054 29.3266 16.282 28.1875 16.282C27.0484 16.282 26.125 17.2054 26.125 18.3445C26.125 19.4836 27.0484 20.407 28.1875 20.407Z"
          fill="black"
        />
        <Path
          d="M8.98633 5.15393L24.5296 2.35204C25.0701 2.25461 25.588 2.61132 25.6897 3.15104L26.067 5.15393L8.98633 5.15393Z"
          fill="black"
        />
        <Path
          d="M30.25 13.9951C29.6249 13.6981 28.9256 13.532 28.1875 13.532C25.5296 13.532 23.375 15.6866 23.375 18.3445C23.375 21.0024 25.5296 23.157 28.1875 23.157C28.9256 23.157 29.6249 22.9908 30.25 22.6939V25.907C30.25 27.4258 29.0188 28.657 27.5 28.657H5.5C3.98122 28.657 2.75 27.4258 2.75 25.907V9.40698C2.75 7.8882 3.98122 6.65698 5.5 6.65698H27.5C29.0188 6.65698 30.25 7.8882 30.25 9.40698V13.9951Z"
          fill="black"
        />
      </Svg>
    ),
  },
  Cash: {
    text: "Cash",
    icon: () => (
      <Svg width="29" height="20" viewBox="0 0 29 20" fill="none">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M25.5 0.375C26.1938 0.374781 26.862 0.636809 27.3708 1.10856C27.8795 1.58031 28.1911 2.22691 28.2431 2.91875L28.25 3.125V16.875C28.2502 17.5688 27.9882 18.237 27.5164 18.7458C27.0447 19.2545 26.3981 19.5661 25.7062 19.6181L25.5 19.625H3.5C2.80621 19.6252 2.13797 19.3632 1.62925 18.8914C1.12052 18.4197 0.80891 17.7731 0.756875 17.0812L0.75 16.875V3.125C0.749781 2.43121 1.01181 1.76297 1.48356 1.25425C1.95531 0.745522 2.60191 0.43391 3.29375 0.381875L3.5 0.375H25.5ZM21.3791 3.125H7.62088L7.625 3.29688C7.625 3.81601 7.52275 4.33006 7.32409 4.80967C7.12542 5.28929 6.83424 5.72508 6.46716 6.09216C6.10007 6.45924 5.66429 6.75042 5.18467 6.94909C4.70506 7.14775 4.19101 7.25 3.67188 7.25L3.5 7.24587V12.7541L3.67188 12.75C4.72031 12.75 5.7258 13.1665 6.46716 13.9078C7.20851 14.6492 7.625 15.6547 7.625 16.7031L7.62088 16.875H21.3791L21.375 16.7031C21.375 15.6949 21.7602 14.7248 22.4519 13.9913C23.1435 13.2577 24.0893 12.8161 25.0957 12.7569L25.4147 12.7514L25.5 12.7541V7.24587L25.3281 7.25C24.3199 7.24999 23.3498 6.86477 22.6163 6.17313C21.8827 5.48149 21.4411 4.53571 21.3819 3.52925L21.375 3.21025L21.3791 3.125ZM25.3281 15.5C25.1556 15.5 24.9851 15.5371 24.8282 15.6088C24.6713 15.6805 24.5316 15.7851 24.4187 15.9155C24.3057 16.0459 24.2222 16.1991 24.1736 16.3646C24.1251 16.5302 24.1127 16.7043 24.1374 16.875H25.5V15.5124C25.4431 15.5042 25.3856 15.5001 25.3281 15.5ZM3.67188 15.5C3.61436 15.5001 3.55693 15.5042 3.5 15.5124V16.875H4.86263C4.88727 16.7043 4.87491 16.5302 4.82637 16.3646C4.77784 16.1991 4.69427 16.0459 4.58133 15.9155C4.46839 15.7851 4.32873 15.6805 4.17181 15.6088C4.01489 15.5371 3.84439 15.5 3.67188 15.5ZM14.5 4.5C15.9587 4.5 17.3576 5.07946 18.3891 6.11091C19.4205 7.14236 20 8.54131 20 10C20 11.4587 19.4205 12.8576 18.3891 13.8891C17.3576 14.9205 15.9587 15.5 14.5 15.5C13.0413 15.5 11.6424 14.9205 10.6109 13.8891C9.57946 12.8576 9 11.4587 9 10C9 8.54131 9.57946 7.14236 10.6109 6.11091C11.6424 5.07946 13.0413 4.5 14.5 4.5ZM14.5 7.25C13.7707 7.25 13.0712 7.53973 12.5555 8.05546C12.0397 8.57118 11.75 9.27065 11.75 10C11.75 10.7293 12.0397 11.4288 12.5555 11.9445C13.0712 12.4603 13.7707 12.75 14.5 12.75C15.2293 12.75 15.9288 12.4603 16.4445 11.9445C16.9603 11.4288 17.25 10.7293 17.25 10C17.25 9.27065 16.9603 8.57118 16.4445 8.05546C15.9288 7.53973 15.2293 7.25 14.5 7.25ZM4.86263 3.125H3.5V4.48763C3.67075 4.51227 3.8448 4.49991 4.01035 4.45137C4.1759 4.40284 4.32908 4.31927 4.45949 4.20633C4.58991 4.09339 4.6945 3.95373 4.7662 3.79681C4.83789 3.63989 4.87499 3.46939 4.875 3.29688L4.87225 3.21025L4.86263 3.125ZM25.5 3.125H24.1374C24.1127 3.29575 24.1251 3.4698 24.1736 3.63535C24.2222 3.8009 24.3057 3.95408 24.4187 4.08449C24.5316 4.21491 24.6713 4.3195 24.8282 4.3912C24.9851 4.46289 25.1556 4.49999 25.3281 4.5L25.4147 4.49725L25.5 4.48625V3.125Z"
          fill="#000000"
        />
      </Svg>
    ),
  },
};

export const SelectVehicleView = ({ action, back, onHeightChange }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const { ride } = useSelector(AppDetailsState);
  const dispatch = useDispatch();
  const [vehicles, setVehicles] = useState<VehicleWithPricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  // Default to Wallet, cash is optional/nullable unless enabled by admin
  const [selectedPayment, setSelectedPayment] = useState<string>("Wallet");
  const [promoCode, setPromoCode] = useState<string>("");
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithPricing | null>(null);
  const [showFareBreakdown, setShowFareBreakdown] = useState(false);
  const [cashEnabled, setCashEnabled] = useState(false); // Check if cash is enabled by admin
  const isFocused = useIsFocused();
  const contentRef = useRef<View>(null);
  
  // Measure content height when content changes (vehicle selected, promo expanded, etc.)
  useEffect(() => {
    if (contentRef.current && onHeightChange) {
      // Longer delay to ensure all vehicles are fully laid out
      const timeoutId = setTimeout(() => {
        contentRef.current?.measure((x, y, width, height, pageX, pageY) => {
          if (height > 0) {
            // Calculate dynamic padding based on content
            const basePadding = 40;
            const selectionPadding = selectedVehicle ? 120 : 0;
            const promoPadding = (selectedVehicle && showPromoInput) ? 60 : 0;
            const vehiclesPadding = vehicles.length > 3 ? (vehicles.length - 3) * 20 : 0;
            
            const totalHeight = height + basePadding + selectionPadding + promoPadding + vehiclesPadding;
            onHeightChange(totalHeight);
            console.log('🔄 Content changed, remeasured height:', { 
              height, 
              total: totalHeight,
              vehiclesCount: vehicles.length,
              hasSelectedVehicle: !!selectedVehicle,
              showPromoInput,
            });
          }
        });
      }, 300); // Increased delay to ensure layout is complete
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedVehicle, showPromoInput, vehicles.length, onHeightChange]);
  
  const rideData = ride?.data as any;
  
  const formatPrice = (cost: number) => {
    return `₦${Math.round(cost).toLocaleString()}`;
  };

  const calculateDiscountedPrice = (original: number) => {
    if (!promoApplied) return original;
    return Math.round(original * 0.9);
  };

  const handlePromoCode = async () => {
    if (!promoCode.trim()) {
      showMessage({ type: "danger", message: "Please enter a promo code" });
      return;
    }

    setPromoLoading(true);
    try {
      // Use request manager to deduplicate promo code validation
      const cacheKey = `promo-${promoCode.trim()}`;
      
      const response = await requestManager.execute(
        cacheKey,
        () => axios.post(APPLY_CODE, { offer_id: promoCode }, apiConfig),
        30000 // Cache for 30 seconds
      );
      
      const data = response.data?.data;
      dispatch(setRideData({ promo_code: promoCode }));
      dispatch(setRideUtils({ promo_code: data?.discount }));
      setPromoApplied(true);
      
      showMessage({
        type: "success",
        message: String(response.data?.message || "Promo code applied successfully"),
      });
    } catch (err: any) {
      dispatch(setRideData({ promo_code: "" }));
      dispatch(setRideUtils({ promo_code: "" }));
      setPromoApplied(false);
      
      const errorMessage = err?.response?.data?.message ||
                          err?.response?.data?.error?.message ||
                          err?.message ||
                          'Invalid promo code';
      
      showMessage({ type: "danger", message: String(errorMessage) });
    } finally {
      setPromoLoading(false);
    }
  };

  const getVehicleData = async () => {
    setLoading(true);
    try {
      // Get origin location for checking available drivers
      const originLat = rideData?.origin ? parseFloat(String(rideData.origin.lat)) : null;
      const originLng = rideData?.origin ? parseFloat(String(rideData.origin.long)) : null;
      const destLat = rideData?.destination ? parseFloat(String(rideData.destination.lat)) : null;
      const destLng = rideData?.destination ? parseFloat(String(rideData.destination.long)) : null;
      
      const hasValidLocation = originLat && originLng && !isNaN(originLat) && !isNaN(originLng);
      const hasValidRoute = hasValidLocation && destLat && destLng && 
                            (destLat !== 0 || destLng !== 0);

      // Step 1: Fetch vehicle types using request manager
      const vehicleTypes = await requestManager.execute(
        'vehicle-types', // Cache key
        async () => {
          const response = await apiClient.get('vehicle/types');
          const rawVehicleTypes = response?.data?.data?.vehicle_types || 
                                 response?.data?.data || 
                                 response?.data || [];
          return rawVehicleTypes.map((v: any) => ({
            ...v,
            vehicle_type: v.display_name || v.name || v.vehicle_type || 'Vehicle',
            vehicle_id: v.vehicle_id || v._id || v.id,
          }));
        },
        30000 // Cache for 30 seconds
      ).catch((error) => {
        console.warn('Failed to fetch vehicle types:', error?.message);
        return []; // Return empty on error
      });
      
      const allVehicles = vehicleTypes.length > 0 ? vehicleTypes : DEFAULT_VEHICLES;
      console.log('🚗 Vehicle types loaded:', allVehicles.length);

      // Step 2: Check available drivers using request manager
      let availableVehicleTypeIds = new Set<string>();
      
      if (hasValidLocation) {
        const cacheKey = `available-drivers-${originLat}-${originLng}`;
        
        const drivers = await requestManager.execute(
          cacheKey,
          async () => {
            const response = await apiClient.get('booking/find-driver', {
              params: {
                loc_lat: originLat,
                loc_long: originLng,
              },
            });
            return response?.data?.data?.drivers || [];
          },
          10000 // Cache for 10 seconds
        ).catch((error) => {
          console.warn('Failed to check drivers:', error?.message);
          return [];
        });

        // Extract vehicle type IDs
        drivers.forEach((driver: any) => {
          const vehicleTypeId = driver.vehicle_type?.toString() || driver.vehicle_type_id?.toString();
          if (vehicleTypeId) {
            availableVehicleTypeIds.add(vehicleTypeId);
          }
        });
        
        console.log('🚗 Available vehicle types:', Array.from(availableVehicleTypeIds));
      }

      // Step 3: Filter and limit vehicles
      let filteredVehicles = allVehicles;
      
      if (hasValidLocation && availableVehicleTypeIds.size > 0) {
        filteredVehicles = allVehicles.filter((vehicle: TVehicle) => {
          const vehicleId = vehicle.vehicle_id?.toString();
          return availableVehicleTypeIds.has(vehicleId);
        });
      }

      const limitedVehicles = filteredVehicles.slice(0, 3);
      console.log('🚗 Final vehicles to show:', limitedVehicles.length);

      // Step 4: Fetch pricing for vehicles
      if (hasValidRoute && limitedVehicles.length > 0) {
        const vehiclesWithPricing: VehicleWithPricing[] = [];
        
        // Fetch all pricing in parallel using request manager (with deduplication)
        const pricingPromises = limitedVehicles.map((vehicle: TVehicle) => {
          const cacheKey = `pricing-${originLat}-${originLng}-${destLat}-${destLng}-${vehicle.vehicle_id}`;
          
          return requestManager.execute(
            cacheKey,
            async () => {
              const response = await apiClient.get('booking/destination-details', {
                params: {
                  pickupLocation: JSON.stringify({ lat: originLat, lng: originLng }),
                  dropoffLocation: JSON.stringify({ lat: destLat, lng: destLng }),
                  vehicleTypeId: vehicle.vehicle_id?.toString() || "1",
                },
              });
              
              const result = response.data?.data;
              return {
                cost: result?.fare?.totalFare || result?.cost || 2000,
                distance: result?.distance || { text: '0 km', value: 0, unit: 'km' },
                duration: result?.duration || { text: '0 min', value: 0, unit: 'minutes' },
              };
            },
            15000 // Cache pricing for 15 seconds
          ).catch((error) => {
            console.warn(`Failed to get pricing for vehicle ${vehicle.vehicle_id}:`, error?.message);
            return {
              cost: 2000,
              distance: { text: '0 km', value: 0, unit: 'km' },
              duration: { text: '4 min', value: 4, unit: 'minutes' },
            };
          });
        });

        // Wait for all pricing requests (they run in parallel, but deduplicated)
        const pricingResults = await Promise.all(pricingPromises);
        
        // Combine vehicles with pricing
        limitedVehicles.forEach((vehicle: TVehicle, index: number) => {
          const pricing = pricingResults[index];
          vehiclesWithPricing.push({
            ...vehicle,
            cost: parseFloat(String(pricing.cost)),
            distance: pricing.distance,
            duration: pricing.duration,
            capacity: (vehicle as any).capacity || 4,
            description: (vehicle as any).description || "Mid-size cars",
            pickupTime: pricing.duration?.text || pricing.duration?.value ? 
              `${Math.round(pricing.duration.value || 0)} min` : "4 min",
          } as VehicleWithPricing);
        });

        setVehicles(vehiclesWithPricing);
        console.log('✅ Vehicles with pricing set:', vehiclesWithPricing.length);
      } else {
        // No valid route, show vehicles without pricing
        const vehiclesWithoutPricing = limitedVehicles.map((v: TVehicle) => ({ 
          ...v, 
          cost: null,
          capacity: (v as any).capacity || 4,
          description: (v as any).description || "Mid-size cars",
          pickupTime: "4 min",
        })) as VehicleWithPricing[];
        
        setVehicles(vehiclesWithoutPricing);
        console.log('⚠️ Showing vehicles without pricing');
      }
    } catch (err: any) {
      console.error('❌ Error in getVehicleData:', err?.message);
      // Fallback to default vehicles
      const fallbackVehicles = DEFAULT_VEHICLES.map(v => ({ 
        ...v, 
        cost: 2000,
        capacity: 4,
        description: "Mid-size cars",
        pickupTime: "4 min",
      })) as VehicleWithPricing[];
      
      setVehicles(fallbackVehicles);
      
      // Only show error message if not a rate limit
      if (err?.status !== 429 && err?.response?.status !== 429) {
        const errorMsg = err?.response?.data?.message || 
                         err?.response?.data?.error?.message || 
                         err?.message || 
                         'Failed to load vehicles';
        showMessage({ type: "danger", message: String(errorMsg) });
      }
    } finally {
      setLoading(false);
    }
  };

  // Check if cash payment is enabled (from admin settings or config)
  useEffect(() => {
    // TODO: Fetch from admin settings API when available
    // For now, cash is disabled by default - set to true if admin enables it
    setCashEnabled(false); // Default: cash disabled, wallet only
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    
    console.log('🎯 SelectVehicleView focused, loading vehicles');
    getVehicleData();
    
    // Trigger initial height measurement after a short delay
    if (onHeightChange && contentRef.current) {
      const timeoutId = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.measure((x, y, width, height, pageX, pageY) => {
            if (height > 0 && onHeightChange) {
              // Add extra padding to ensure buttons are visible
              const extraPadding = selectedVehicle ? 60 : 30;
              const totalHeight = height + extraPadding;
              onHeightChange(totalHeight);
              console.log('📏 Initial height measurement:', { 
                height, 
                total: totalHeight,
                extraPadding,
                hasSelectedVehicle: !!selectedVehicle
              });
            }
          });
        }
      }, 300);
      
      return () => {
        clearTimeout(timeoutId);
        // Clear vehicle-related cache when component unmounts
        console.log('🧹 SelectVehicleView unmounting, clearing cache');
      };
    } else {
      return () => {
        // Clear vehicle-related cache when component unmounts
        console.log('🧹 SelectVehicleView unmounting, clearing cache');
      };
    }
  }, [isFocused, onHeightChange]); // Added onHeightChange to dependencies

  // Track content changes to trigger height remeasurement
  useEffect(() => {
    if (onHeightChange && contentRef.current) {
      // Force a layout recalculation by requesting a layout measurement
      // This ensures onLayout fires when content changes
      const timeoutId = setTimeout(() => {
      // Calculate height based on content
      const screenHeight = Dimensions.get('window').height;
      const headerHeight = 65; // More compact header
      // Height per vehicle card (~65px per card + 10px margin for spacing)
      const vehicleCardHeight = 75;
      const vehiclesHeight = vehicles.length * vehicleCardHeight;
      // Additional height when vehicle is selected (more compact):
      const selectedButtonHeight = 0; // Removed selected button
      const paymentSectionHeight = selectedVehicle ? 45 : 0;
      const promoSectionHeight = selectedVehicle ? (showPromoInput ? 65 : 30) : 0;
      const requestButtonHeight = selectedVehicle ? 38 : 0;
      const selectionHeight = selectedButtonHeight + paymentSectionHeight + promoSectionHeight + requestButtonHeight;
      // Extra padding to ensure last item is fully visible (minimal)
      const bottomPadding = 8;
      
      // Calculate total height needed
      const totalHeight = headerHeight + vehiclesHeight + selectionHeight + bottomPadding;
      
      // Set a minimum height and maximum height (95% of screen to show all content)
      const minHeight = Math.min(400, screenHeight * 0.5);
      const maxHeight = screenHeight * 0.95; // Increased to 95% to show all content
      const finalHeight = Math.max(minHeight, Math.min(maxHeight, totalHeight));
        
        onHeightChange(finalHeight);
        console.log('🔄 Content changed, recalculated height:', { 
          calculated: totalHeight,
          final: finalHeight,
          vehiclesCount: vehicles.length,
          vehiclesHeight,
          hasSelectedVehicle: !!selectedVehicle,
          showPromoInput,
          screenHeight,
        });
      }, 300); // Increased delay to ensure layout is complete
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedVehicle, showPromoInput, vehicles.length, onHeightChange]);

  console.log('🎨 Render state:', { loading, vehiclesCount: vehicles.length, isFocused });

  // Always show loading if we have no vehicles yet
  if ((loading && vehicles.length === 0) || (!vehicles || vehicles.length === 0)) {
    return (
      <View style={[styles.loadingContainer, { flex: 1, minHeight: 400, width: '100%' }]}>
        <ActivityIndicator color={tw.color("base-green")} size="large" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

  console.log('🎨 Rendering vehicles list with', vehicles.length, 'vehicles');

  // Measure total content height including header and all sections
  const handleWrapperLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (onHeightChange && height > 0) {
      // Calculate dynamic height based on content
      // Base height for header (more compact)
      const headerHeight = 65;
      // Height per vehicle card (~65px per card + 10px margin for spacing)
      const vehicleCardHeight = 75;
      const vehiclesHeight = vehicles.length * vehicleCardHeight;
      // Additional height when vehicle is selected (more compact):
      // - Payment section: ~45px
      // - Promo section (collapsed): ~30px
      // - Promo section (expanded): ~65px
      // - Request Ride button: ~38px
      const selectedButtonHeight = 0; // Removed selected button
      const paymentSectionHeight = selectedVehicle ? 45 : 0;
      const promoSectionHeight = selectedVehicle ? (showPromoInput ? 65 : 30) : 0;
      const requestButtonHeight = selectedVehicle ? 38 : 0;
      const selectionHeight = selectedButtonHeight + paymentSectionHeight + promoSectionHeight + requestButtonHeight;
      // Extra padding to ensure last item is fully visible (minimal)
      const bottomPadding = 8;
      
      // Calculate total height needed
      const totalHeight = headerHeight + vehiclesHeight + selectionHeight + bottomPadding;
      
      // Set a minimum height and maximum height (increased by 20%)
      const screenHeight = Dimensions.get('window').height;
      const minHeight = Math.min(400, screenHeight * 0.5);
      const maxHeight = screenHeight * 0.95; // Increased to 95% to show all content
      // Increase calculated height by 20%
      const increasedHeight = totalHeight * 1.2;
      const finalHeight = Math.max(minHeight, Math.min(maxHeight, increasedHeight));
      
      onHeightChange(finalHeight);
      console.log('📏 onLayout - Total content height calculated:', { 
        wrapper: height, 
        calculated: totalHeight,
        final: finalHeight,
        headerHeight,
        vehiclesHeight,
        vehiclesCount: vehicles.length,
        selectionHeight,
        selectedButtonHeight,
        paymentSectionHeight,
        promoSectionHeight,
        requestButtonHeight,
        hasSelectedVehicle: !!selectedVehicle,
        showPromoInput,
      });
    }
  };

  return (
    <View 
      style={[styles.wrapper, { width: '100%' }]}
      ref={contentRef}
      onLayout={handleWrapperLayout}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Vehicle</Text>
        <Text style={styles.headerSubtitle}>
          Choose your preferred ride type
        </Text>
      </View>

      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        bounces={true}
        alwaysBounceVertical={false}
      >
      {vehicles.map((vehicle) => {
        const originalPrice = vehicle.cost || 2000;
        const finalPrice = calculateDiscountedPrice(originalPrice);
        const hasDiscount = promoApplied && originalPrice !== finalPrice;
        const isSelected = selectedVehicle?.vehicle_id === vehicle.vehicle_id;

        return (
          <View key={vehicle.vehicle_id} style={styles.vehicleCardContainer}>
            {/* Vehicle Card */}
            <Pressable
              style={[
                styles.vehicleCard,
                isSelected && styles.vehicleCardSelected
              ]}
              onPress={() => setSelectedVehicle(vehicle)}
            >
              <View style={styles.vehicleIconContainer}>
                <Image
                  source={
                    vehicle.vehicle_type_image
                      ? { uri: vehicle.vehicle_type_image }
                      : getVehicleImage(vehicle.vehicle_id || 1, vehicle.vehicle_type)
                  }
                  style={styles.vehicleIcon}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.vehicleInfo}>
                <View style={styles.vehicleNameRow}>
                  <Text style={styles.vehicleName}>
                    {vehicle.display_name || vehicle.name || vehicle.vehicle_type || "Vehicle"}
                  </Text>
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <Ionicons name="checkmark-circle" size={22} color={tw.color("base-green") || "#3C8F7C"} />
                    </View>
                  )}
                </View>
                <View style={styles.vehicleMeta}>
                  <Ionicons name="time-outline" size={14} color="#666" style={{ marginRight: 4 }} />
                  <Text style={styles.metaText}>{vehicle.pickupTime || "4 min"}</Text>
                </View>
              </View>

              {vehicle.cost !== null && vehicle.cost !== undefined && (
                <TouchableOpacity 
                  style={styles.priceContainer}
                  onPress={() => setShowFareBreakdown(true)}
                  activeOpacity={0.7}
                >
                  {/* Surge Pricing Indicator */}
                  {(vehicle as any).surgeMultiplier && (vehicle as any).surgeMultiplier > 1 && (
                    <View style={styles.surgeBadge}>
                      <Text style={styles.surgeText}>
                        {(vehicle as any).surgeMultiplier}x
                      </Text>
                    </View>
                  )}
                  <Text style={[
                    styles.price,
                    (vehicle as any).surgeMultiplier && (vehicle as any).surgeMultiplier > 1 && styles.surgePrice
                  ]}>
                    {formatPrice(finalPrice)}
                  </Text>
                  {hasDiscount && (
                    <Text style={styles.oldPrice}>{formatPrice(originalPrice)}</Text>
                  )}
                  <Text style={styles.breakdownHint}>Tap for details</Text>
                </TouchableOpacity>
              )}
            </Pressable>
            
          </View>
        );
      })}

      {/* Payment Selection - Only show when vehicle is selected */}
      {selectedVehicle && (
        <>
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <View style={styles.paymentContainer}>
              {/* Wallet is always available */}
              <TouchableOpacity
                onPress={() => setSelectedPayment("Wallet")}
                style={[
                  styles.paymentOption,
                  selectedPayment === "Wallet" && styles.paymentOptionActive,
                  styles.paymentOptionLeft,
                  !cashEnabled && styles.paymentOptionRight, // If cash disabled, this is the only option
                ]}
              >
                <View style={[styles.paymentIcon, selectedPayment === "Wallet" && styles.paymentIconActive]}>
                  {PaymentModes.Wallet.icon()}
                </View>
                <Text style={[
                  styles.paymentText,
                  selectedPayment === "Wallet" && styles.paymentTextActive
                ]}>
                  Wallet
                </Text>
              </TouchableOpacity>
              
              {/* Cash is optional - only show if enabled by admin */}
              {cashEnabled && (
                <TouchableOpacity
                  onPress={() => setSelectedPayment("Cash")}
                  style={[
                    styles.paymentOption,
                    selectedPayment === "Cash" && styles.paymentOptionActive,
                    styles.paymentOptionRight,
                  ]}
                >
                  <View style={[styles.paymentIcon, selectedPayment === "Cash" && styles.paymentIconActive]}>
                    {PaymentModes.Cash.icon()}
                  </View>
                  <Text style={[
                    styles.paymentText,
                    selectedPayment === "Cash" && styles.paymentTextActive
                  ]}>
                    Cash
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Promo Code Section */}
          <View style={styles.promoSection}>
            <TouchableOpacity
              onPress={() => setShowPromoInput(!showPromoInput)}
              style={styles.promoHeader}
            >
              <Text style={styles.promoHeaderText}>Apply Promo Code</Text>
              <AntDesign
                name={showPromoInput ? "up" : "down"}
                size={16}
                color={tw.color("base-green") || "#3C8F7C"}
              />
            </TouchableOpacity>
            {showPromoInput && (
              <View style={styles.promoInputContainer}>
                <TextInput
                  value={promoCode}
                  onChangeText={setPromoCode}
                  placeholder="Enter promo code"
                  placeholderTextColor="#C8C7CC"
                  style={styles.promoInput}
                />
                <TouchableOpacity
                  onPress={handlePromoCode}
                  disabled={promoLoading || !promoCode.trim()}
                  style={[
                    styles.promoButton,
                    (!promoCode.trim() || promoLoading) && styles.promoButtonDisabled
                  ]}
                >
                  {promoLoading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.promoButtonText}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}

      {/* Request Ride Button - At end of content */}
      {selectedVehicle && (
        <View style={styles.requestButtonWrapper}>
          <TouchableOpacity
            style={styles.requestButton}
            onPress={() => action(selectedVehicle, selectedPayment, promoCode || undefined)}
            activeOpacity={0.8}
          >
            <Text style={styles.requestButtonText}>Request Ride</Text>
            <Ionicons name="arrow-forward" size={18} color="white" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      )}

      {/* Fare Breakdown Modal */}
      {selectedVehicle && selectedVehicle.cost !== null && (() => {
        // Calculate pricing explicitly
        const baseFare = selectedVehicle.cost || 0;
        const promoDiscount = promoApplied ? baseFare * 0.1 : 0;
        const finalPrice = baseFare - promoDiscount;
        
        return (
          <FareBreakdownModal
            visible={showFareBreakdown}
            onClose={() => setShowFareBreakdown(false)}
            fare={{
              baseFare: baseFare * 0.3, // Estimate - should come from API
              distanceFare: baseFare * 0.5,
              timeFare: baseFare * 0.2,
              surgeMultiplier: (selectedVehicle as any).surgeMultiplier || 1, // Should come from API
              promoDiscount: promoDiscount,
              totalFare: finalPrice, // ✅ Now properly defined
              currency: '₦',
            }}
            distance={typeof selectedVehicle.distance === 'object' ? selectedVehicle.distance : undefined}
            duration={typeof selectedVehicle.duration === 'object' ? selectedVehicle.duration : undefined}
          />
        );
      })()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    width: '100%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 2,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    height: 39,
    width: 39,
    backgroundColor: '#000',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
    marginBottom: 0,
    letterSpacing: 0.1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'RobotoRegular',
    marginTop: 1,
  },
  container: {
    backgroundColor: '#fff',
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 8,
  },
  vehicleCardContainer: {
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    fontFamily: 'RobotoRegular',
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  vehicleCardSelected: {
    borderColor: tw.color("base-green") || '#3C8F7C',
    borderWidth: 3,
    backgroundColor: '#F0F9F4',
    shadowColor: tw.color("base-green") || '#3C8F7C',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  vehicleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectedBadge: {
    marginLeft: 8,
  },
  vehicleIconContainer: {
    width: 45,
    height: 45,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 6,
  },
  vehicleIcon: {
    width: '100%',
    height: '100%',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
    letterSpacing: 0.1,
  },
  vehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'RobotoMedium',
  },
  priceContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 70,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
    letterSpacing: 0.1,
  },
  oldPrice: {
    fontSize: 13,
    color: '#999',
    textDecorationLine: 'line-through',
    marginTop: 2,
    fontFamily: 'RobotoRegular',
  },
  breakdownHint: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    fontFamily: 'RobotoRegular',
  },
  surgeBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
    alignSelf: 'flex-end',
  },
  surgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'RobotoBold',
  },
  surgePrice: {
    color: '#FF6B6B',
  },
  paymentSection: {
    marginTop: 2,
    marginBottom: 2,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
    fontFamily: 'RobotoBold',
    letterSpacing: 0.1,
  },
  paymentContainer: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#EFEFF4',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
    borderRightWidth: 1,
    borderRightColor: '#EFEFF4',
  },
  paymentOptionLeft: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  paymentOptionRight: {
    borderRightWidth: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  paymentOptionActive: {
    backgroundColor: '#F0F9F4',
    borderColor: tw.color("base-green") || '#3C8F7C',
  },
  paymentIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
    opacity: 0.3,
  },
  paymentIconActive: {
    opacity: 1,
  },
  paymentText: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'RobotoRegular',
    marginTop: 0,
  },
  paymentTextActive: {
    color: '#1A1A1A',
    fontFamily: 'RobotoBold',
  },
  promoSection: {
    marginBottom: 2,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  promoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  promoHeaderText: {
    fontSize: 13,
    color: tw.color("base-green") || '#3C8F7C',
    fontFamily: 'RobotoMedium',
    textDecorationLine: 'underline',
  },
  promoInputContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  promoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'RobotoRegular',
  },
  promoButton: {
    backgroundColor: tw.color("base-green"),
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
    height: 40,
  },
  promoButtonDisabled: {
    opacity: 0.5,
  },
  promoButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'RobotoBold',
  },
  requestButtonWrapper: {
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  requestButton: {
    backgroundColor: tw.color("base-green"),
    borderRadius: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tw.color("base-green"),
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  requestButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'RobotoBold',
  },
  selectButton: {
    marginTop: 6,
    backgroundColor: tw.color('base-green') || '#3C8F7C',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tw.color('base-green') || '#3C8F7C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  selectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'RobotoBold',
  },
});
