import { ActivityIndicator, Image, Text, View, StyleSheet, Dimensions, TextInput, FlatList, InteractionManager } from "react-native";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AppContext } from "@/app/context";
import { FareBreakdownModal } from "./fareBreakdown";
import { AppDetailsState, setRideData, setRideUtils } from "@/store/AppSlice";
import { TVehicle } from "@/types";
import { VEHICLE_TYPES, APPLY_CODE } from "@/constants";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { getVehicleImageSource } from "@/utils/vehicleImages";
import { useSelector, useDispatch } from "react-redux";
import apiClient from "@/utils/apiClient";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Path, Svg } from "react-native-svg";
import { requestManager } from "@/utils/requestManager";
import { useCombinedSafeInsets, sheetFooterBottomPadding } from "@/hooks/useCombinedSafeInsets";
import { Pressable, TouchableOpacity } from "react-native-gesture-handler";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  configToEnabledMethods,
  defaultUiPaymentKey,
  isWalletPaymentMethod,
  mapUiPaymentToApi,
  preferCashWhenWalletLow,
} from "@/utils/paymentMethods";
import { getCachedWallet, setCachedWallet } from "@/utils/walletCache";

interface Props {
  action: (vehicle: TVehicle, paymentMethod: string, promoCode?: string) => void;
  back?: () => void;
  /**
   * Room available inside the sheet. Caps the content so the list shrinks and
   * scrolls instead of pushing the pinned action button past the sheet's edge.
   */
  maxContentHeight?: number;
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
  fareDetail?: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    minimumFare: number;
    preSurgeFare: number;
    totalFare: number;
    surgeMultiplier: number;
    isSurged: boolean;
    riderServiceCharge?: number;
    riderTotal?: number;
    currency?: string;
  } | null;
  surgeMultiplier?: number;
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

const SelectVehicleViewComponent = ({ action, back, maxContentHeight }: Props) => {
  const insets = useCombinedSafeInsets();
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
  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const { config: publicConfig } = usePublicConfig();
  const enabledPaymentMethods = useMemo(
    () => configToEnabledMethods(publicConfig.paymentMethods),
    [publicConfig.paymentMethods]
  );
  const selectedFareTotal = useMemo(() => {
    if (!selectedVehicle) return 0;
    if (typeof selectedVehicle.fareDetail?.riderTotal === "number") {
      return selectedVehicle.fareDetail.riderTotal;
    }
    const cost = selectedVehicle.cost;
    return typeof cost === "number" ? cost : Number(cost || 0);
  }, [selectedVehicle]);
  const walletInsufficientForSelectedFare =
    walletAvailableBalance != null &&
    selectedFareTotal > 0 &&
    walletAvailableBalance < selectedFareTotal;
  const selectedIsWallet = isWalletPaymentMethod(mapUiPaymentToApi(selectedPayment));

  useEffect(() => {
    setSelectedPayment((prev) =>
      preferCashWhenWalletLow(
        publicConfig.paymentMethods,
        prev,
        walletAvailableBalance,
        selectedFareTotal
      )
    );
  }, [publicConfig.paymentMethods, walletAvailableBalance, selectedFareTotal]);

  const isFocused = useIsFocused();

  const rideData = ride?.data as any;
  
  const formatPrice = useCallback((cost: number) => {
    return `₦${Math.round(cost).toLocaleString()}`;
  }, []);

  const calculateDiscountedPrice = useCallback((original: number) => {
    if (!promoApplied) return original;
    return Math.round(original * 0.9);
  }, [promoApplied]);

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
        () => axios.post(APPLY_CODE, { code: promoCode }, apiConfig),
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
      // Get origin and destination (support both lat/long and latitude/longitude)
      const oLat = rideData?.origin?.lat ?? rideData?.origin?.latitude;
      const oLng = rideData?.origin?.long ?? rideData?.origin?.longitude;
      const dLat = rideData?.destination?.lat ?? rideData?.destination?.latitude;
      const dLng = rideData?.destination?.long ?? rideData?.destination?.longitude;
      const originLat = oLat != null ? parseFloat(String(oLat)) : null;
      const originLng = oLng != null ? parseFloat(String(oLng)) : null;
      const destLat = dLat != null ? parseFloat(String(dLat)) : null;
      const destLng = dLng != null ? parseFloat(String(dLng)) : null;
      
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
              const rawDuration = result?.duration;
              const durationValue = Math.max(1, Math.round(Number(rawDuration?.value ?? 0)));
              const duration = rawDuration
                ? { ...rawDuration, value: durationValue, text: `${durationValue} min` }
                : { text: '4 min', value: 4, unit: 'minutes' };
              const f = result?.fare;
              const totalFareNum =
                f?.totalFare != null && !Number.isNaN(Number(f.totalFare))
                  ? Number(f.totalFare)
                  : result?.cost != null
                    ? parseFloat(String(result.cost))
                    : NaN;
              const fareDetail = f
                ? {
                    baseFare: Number(f.baseFare) || 0,
                    distanceFare: Number(f.distanceFare) || 0,
                    timeFare: Number(f.timeFare) || 0,
                    minimumFare: Number(f.minimumFare) || 0,
                    preSurgeFare:
                      f.preSurgeFare != null && !Number.isNaN(Number(f.preSurgeFare))
                        ? Number(f.preSurgeFare)
                        : Number(f.totalFare) || 0,
                    totalFare: Number.isFinite(totalFareNum) ? totalFareNum : 0,
                    surgeMultiplier: Number(f.surgeMultiplier) >= 1 ? Number(f.surgeMultiplier) : 1,
                    isSurged: !!f.isSurged,
                    riderServiceCharge:
                      f.riderServiceCharge != null && !Number.isNaN(Number(f.riderServiceCharge))
                        ? Number(f.riderServiceCharge)
                        : undefined,
                    riderTotal:
                      f.riderTotal != null && !Number.isNaN(Number(f.riderTotal))
                        ? Number(f.riderTotal)
                        : undefined,
                    currency: typeof f.currency === 'string' ? f.currency : 'NGN',
                  }
                : null;
              return {
                cost: Number.isFinite(totalFareNum) ? totalFareNum : null,
                distance: result?.distance || { text: '0 km', value: 0, unit: 'km' },
                duration,
                fareDetail,
                surgeMultiplier:
                  fareDetail && fareDetail.surgeMultiplier > 1 ? fareDetail.surgeMultiplier : undefined,
              };
            },
            15000 // Cache pricing for 15 seconds
          ).catch((error) => {
            console.warn(`Failed to get pricing for vehicle ${vehicle.vehicle_id}:`, error?.message);
            return {
              cost: null,
              distance: { text: '0 km', value: 0, unit: 'km' },
              duration: { text: '4 min', value: 4, unit: 'minutes' },
              fareDetail: null as VehicleWithPricing['fareDetail'],
              surgeMultiplier: undefined as number | undefined,
            };
          });
        });

        // Wait for all pricing requests (they run in parallel, but deduplicated)
        const pricingResults = await Promise.all(pricingPromises);
        
        // Combine vehicles with pricing
        limitedVehicles.forEach((vehicle: TVehicle, index: number) => {
          const pricing = pricingResults[index];
          const costNum =
            typeof pricing.cost === 'number'
              ? pricing.cost
              : pricing.cost != null
                ? parseFloat(String(pricing.cost))
                : null;
          vehiclesWithPricing.push({
            ...vehicle,
            cost: Number.isFinite(costNum as number) ? (costNum as number) : null,
            distance: pricing.distance,
            duration: pricing.duration,
            capacity: (vehicle as any).capacity || 4,
            description: (vehicle as any).description || "Mid-size cars",
            pickupTime: pricing.duration?.text || (pricing.duration?.value != null ? `${Math.max(1, Math.round(pricing.duration.value))} min` : "4 min"),
            fareDetail: pricing.fareDetail ?? null,
            surgeMultiplier: pricing.surgeMultiplier,
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
        cost: null,
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

  // Default payment method from admin config
  useEffect(() => {
    const defaultKey = defaultUiPaymentKey(publicConfig.paymentMethods);
    setSelectedPayment(defaultKey);
  }, [publicConfig.paymentMethods]);

  useEffect(() => {
    if (!selectedVehicle) {
      setWalletAvailableBalance(null);
      return;
    }

    let mounted = true;
    const cachedWallet = getCachedWallet<any>();
    const walletPromise = cachedWallet
      ? Promise.resolve(cachedWallet)
      : apiClient.get("wallet", { timeout: 10000 }).then((res) => {
          setCachedWallet(res);
          return res;
        });

    walletPromise
      .then((walletRes) => {
        if (!mounted) return;
        const data = walletRes?.data?.data;
        const available = data?.availableBalance ?? data?.balance;
        const num = typeof available === "number" ? available : Number(available || 0);
        setWalletAvailableBalance(Number.isFinite(num) ? num : 0);
      })
      .catch(() => {
        if (!mounted) return;
        setWalletAvailableBalance(null);
      });

    return () => {
      mounted = false;
    };
  }, [selectedVehicle?.vehicle_id]);

  useEffect(() => {
    if (!isFocused) return;
    
    console.log('🎯 SelectVehicleView focused, loading vehicles');
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      getVehicleData();
    });

    return () => {
      interactionTask.cancel();
      // Clear vehicle-related cache when component unmounts
      console.log('🧹 SelectVehicleView unmounting, clearing cache');
    };
  }, [isFocused]);

  console.log('🎨 Render state:', { loading, vehiclesCount: vehicles.length, isFocused });

  const shouldShowLoadingState = (loading && vehicles.length === 0) || (!vehicles || vehicles.length === 0);

  console.log('🎨 Rendering vehicles list with', vehicles.length, 'vehicles');

  const renderVehicleItem = useCallback(({ item: vehicle }: { item: VehicleWithPricing }) => {
    const originalPrice = vehicle.cost ?? 0;
    const finalPrice = calculateDiscountedPrice(originalPrice);
    const hasDiscount = promoApplied && originalPrice !== finalPrice;
    const isSelected = selectedVehicle?.vehicle_id === vehicle.vehicle_id;

    return (
      <View style={styles.vehicleCardContainer}>
        <Pressable
          style={[
            styles.vehicleCard,
            isSelected && styles.vehicleCardSelected
          ]}
          onPress={() => setSelectedVehicle(vehicle)}
        >
          <View style={styles.vehicleIconContainer}>
            <Image
              source={getVehicleImageSource(
                vehicle.vehicle_id,
                vehicle.vehicle_type_image || vehicle.image,
                vehicle.display_name || vehicle.name || vehicle.vehicle_type
              )}
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
              <Ionicons name="time-outline" size={14} color="#666" style={styles.metaIcon} />
              <Text style={styles.metaText}>{vehicle.pickupTime || "4 min"}</Text>
            </View>
          </View>

          {vehicle.cost !== null && vehicle.cost !== undefined && vehicle.cost > 0 && (
            <TouchableOpacity
              style={styles.priceContainer}
              onPress={() => setShowFareBreakdown(true)}
              activeOpacity={0.7}
            >
              {vehicle.surgeMultiplier && vehicle.surgeMultiplier > 1 && (
                <View style={styles.surgeBadge}>
                  <Text style={styles.surgeText}>
                    {vehicle.surgeMultiplier}x
                  </Text>
                </View>
              )}
              <Text style={[
                styles.price,
                vehicle.surgeMultiplier && vehicle.surgeMultiplier > 1 && styles.surgePrice
              ]}>
                {formatPrice(finalPrice)}
              </Text>
              {hasDiscount && <Text style={styles.oldPrice}>{formatPrice(originalPrice)}</Text>}
              <Text style={styles.breakdownHint}>Tap for details</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </View>
    );
  }, [calculateDiscountedPrice, formatPrice, promoApplied, selectedVehicle]);

  const vehicleKeyExtractor = useCallback(
    (item: VehicleWithPricing, index: number) => item.vehicle_id?.toString() || String(index),
    []
  );

  const requestButtonPaddingStyle = useMemo(
    () => ({ paddingBottom: sheetFooterBottomPadding(insets.bottom) }),
    [insets.bottom]
  );

  // Keep this return after all hooks to preserve stable hook order across renders.
  if (shouldShowLoadingState) {
    return (
      <View style={[styles.loadingContainer, { flex: 1, minHeight: 400, width: '100%' }]}>
        <ActivityIndicator color={tw.color("base-green")} size="large" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrapper,
        { width: '100%' },
        maxContentHeight ? { maxHeight: maxContentHeight } : null,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Vehicle</Text>
        <Text style={styles.headerSubtitle}>
          Choose your preferred ride type
        </Text>
      </View>

      <FlatList
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        data={vehicles}
        renderItem={renderVehicleItem}
        keyExtractor={vehicleKeyExtractor}
        removeClippedSubviews={true}
        maxToRenderPerBatch={4}
        windowSize={3}
        initialNumToRender={3}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        ListFooterComponent={(
          <>
      {/* Payment Selection - Only show when vehicle is selected */}
      {selectedVehicle && (
        <>
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <PaymentMethodSelector
              selected={selectedPayment}
              onSelect={setSelectedPayment}
              enabledMethods={enabledPaymentMethods}
              walletBalance={walletAvailableBalance}
              fareTotal={
                typeof selectedVehicle?.fareDetail?.riderTotal === "number"
                  ? selectedVehicle.fareDetail.riderTotal
                  : typeof selectedVehicle?.cost === "number"
                    ? selectedVehicle.cost
                    : Number(selectedVehicle?.cost || 0) || undefined
              }
              variant="compact"
            />
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

      {/* Fare Breakdown Modal */}
      {selectedVehicle && selectedVehicle.cost !== null && selectedVehicle.cost > 0 && (() => {
        const fd = selectedVehicle.fareDetail;
        const rideFare = fd?.totalFare ?? selectedVehicle.cost ?? 0;
        const promoDiscount = promoApplied ? Math.round(rideFare * 0.1) : 0;
        const rideAfterPromo = Math.max(0, rideFare - promoDiscount);
        const svc = fd?.riderServiceCharge ?? 0;
        const riderTotalShown =
          fd?.riderTotal != null
            ? Math.max(0, fd.riderTotal - promoDiscount)
            : svc > 0
              ? rideAfterPromo + svc
              : undefined;

        return (
          <FareBreakdownModal
            visible={showFareBreakdown}
            onClose={() => setShowFareBreakdown(false)}
            fare={{
              baseFare: fd?.baseFare,
              distanceFare: fd?.distanceFare,
              timeFare: fd?.timeFare && fd.timeFare > 0 ? fd.timeFare : undefined,
              preSurgeFare: fd?.preSurgeFare,
              surgeMultiplier: fd?.surgeMultiplier ?? 1,
              promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
              totalFare: rideAfterPromo,
              riderServiceCharge: svc > 0 ? svc : undefined,
              riderTotal: riderTotalShown,
              currency: fd?.currency || 'NGN',
            }}
            distance={typeof selectedVehicle.distance === 'object' ? selectedVehicle.distance : undefined}
            duration={typeof selectedVehicle.duration === 'object' ? selectedVehicle.duration : undefined}
          />
        );
      })()}
          </>
        )}
      >
      </FlatList>

      {/* Pinned footer: stays outside the list so it can never scroll out of view. */}
      {selectedVehicle && (
        <View style={[styles.requestButtonWrapper, requestButtonPaddingStyle]}>
          <TouchableOpacity
            style={[
              styles.requestButton,
              selectedIsWallet && walletInsufficientForSelectedFare && styles.requestButtonDisabled,
            ]}
            onPress={() => {
              if (selectedIsWallet && walletInsufficientForSelectedFare) {
                showMessage({
                  type: "warning",
                  message: "Insufficient wallet balance. Switch to Cash or top up your wallet.",
                });
                return;
              }
              action(selectedVehicle, selectedPayment, promoCode || undefined);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.requestButtonText}>Request Ride</Text>
            <Ionicons name="arrow-forward" size={18} color="white" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const SelectVehicleView = React.memo(SelectVehicleViewComponent);

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
    // Shrink (and scroll) when the sheet is capped, so the pinned footer below
    // always keeps its room. Not `flex: 1` — the sheet body has no fixed height.
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 2,
    // The action button is a pinned sibling now, so this only needs to clear the
    // last row rather than reserve space for the footer.
    paddingBottom: 12,
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
    elevation: 3,
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
  metaIcon: {
    marginRight: 4,
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
    // Outside the list now, so it needs the gutters the list supplied before.
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#fff',
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
    elevation: 2,
  },
  requestButtonDisabled: {
    opacity: 0.55,
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
    elevation: 2,
  },
  selectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'RobotoBold',
  },
});
