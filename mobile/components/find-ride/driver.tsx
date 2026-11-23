import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  View,
  StyleSheet,
  InteractionManager,
} from "react-native";
import { AppDetailsState, setRideData, setRideUtils } from "@/store/AppSlice";
import { Path, Svg } from "react-native-svg";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { AntDesign, Ionicons } from "@expo/vector-icons";
import { getVehicleImage } from "@/utils/vehicleImages";
import { Image as RNImage } from "react-native";
import { Pressable, TouchableOpacity } from "react-native-gesture-handler";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import apiClient from "@/utils/apiClient";
import { NoDriversScreen } from "./NoDriversScreen";
import { requestManager } from "@/utils/requestManager";
import { getErrorMessage } from "@/utils/errorHandler";
import {
  useCombinedSafeInsets,
  sheetFooterBottomPadding,
} from "@/hooks/useCombinedSafeInsets";

interface LProps {
  item: object;
  onSelect: (driverId: string) => void;
  isSelected: boolean;
  isLast: boolean;
}

const ListItem = memo(({ item, onSelect, isSelected, isLast }: LProps) => {
  const { ride } = useSelector(AppDetailsState);
  const rideUtils = ride?.utils as any;
  const selectedVehicle = rideUtils?.vehicle;
  const itemData = item as any;

  const driverVehicleType =
    itemData?.vehicle_type_name ||
    itemData?.vehicle_type?.name ||
    itemData?.vehicleDetails?.vehicleType?.name ||
    selectedVehicle?.vehicle_type_name;
  const driverVehicleId =
    itemData?.vehicle_type_id ||
    itemData?.vehicle_type?.id ||
    itemData?.vehicle_type ||
    itemData?.vehicleDetails?.vehicleType?._id ||
    selectedVehicle?.vehicle_type_id;

  const driverId = itemData?.driver_id;

  return (
    <View style={tw.style(`w-full px-1`, !isLast && `mb-2`)}>
      <Pressable
        onPress={() => {
          if (!driverId) return;
          onSelect(driverId);
        }}
        style={tw.style(
          `flex-row items-center w-full px-4 py-3 rounded-[20px]`,
          {
            backgroundColor: isSelected ? "#0D1F1A" : "#000",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
            zIndex: 20,
            position: "relative",
            overflow: "visible",
            minHeight: 80,
            borderWidth: isSelected ? 2 : 0,
            borderColor: isSelected ? tw.color("base-green") || "#00C853" : "transparent",
          }
        )}
        android_ripple={{ color: "rgba(255,255,255,0.1)" }}
      >
        <View style={tw`flex-col gap-0.5 flex-shrink-0 mr-2`}>
          <View
            style={{
              width: 53,
              height: 20,
              justifyContent: "center",
              alignItems: "flex-start",
              marginBottom: 1,
            }}
          >
            {driverVehicleType ? (
              <RNImage
                source={getVehicleImage(driverVehicleId, driverVehicleType)}
                style={{ width: 53, height: 20 }}
                resizeMode="contain"
              />
            ) : (
              <Svg width="53" height="20" viewBox="0 0 53 20" fill="none" preserveAspectRatio="xMidYMid meet">
                <Path
                  d="M52.2019 9.06107C52.1275 8.33419 52.044 7.51161 51.8811 6.8018C51.7679 6.30535 51.5191 5.64429 50.6778 5.64429C50.5935 5.64429 50.5091 5.65101 50.4257 5.658C50.3737 5.66201 50.3217 5.6677 50.2365 5.66899C50.2347 5.66899 50.2074 5.64752 50.1728 5.56593C49.9257 4.99267 48.8894 4.27962 47.5605 3.40752C47.2331 3.1935 46.8412 2.93577 46.6743 2.80284C46.7356 2.45937 46.7265 2.03755 46.4314 1.74684C46.2943 1.61119 46.0363 1.44916 45.5917 1.44916C45.5264 1.44916 45.457 1.45239 45.3025 1.46351C44.9816 1.46351 44.3387 1.3567 43.4486 1.2076C41.1534 0.825988 36.8813 0.114881 30.4754 0.00302276C21.1482 -0.146596 13.8188 5.30678 13.5166 5.53644L13.3005 5.69912C12.9175 5.84913 11.7078 6.20772 8.0103 6.79662C2.76586 7.6333 1.76544 8.98697 1.57646 9.51044C1.1578 9.76364 0.479785 10.3675 0.372368 11.078C0.286019 11.6445 0.0904983 11.8763 0.0904983 11.8756L0 11.9702V15.9691L0.010215 16.042C0.294479 17.104 1.65291 17.6659 3.93851 17.6659C4.66745 17.6659 5.21427 17.6056 5.19304 17.6056C5.2248 17.6042 5.50667 17.6003 5.99507 17.5922C5.94512 17.4803 5.89963 17.3671 5.86036 17.2513C5.82238 17.1396 5.78758 17.027 5.76077 16.9118C5.69629 16.6405 5.66005 16.3613 5.66005 16.0748C5.66005 13.6173 8.12777 11.6178 11.161 11.6178C14.1942 11.6178 16.6621 13.6173 16.6621 16.0748C16.6621 16.2971 16.6352 16.5126 16.5968 16.7263C16.5757 16.8421 16.5513 16.9572 16.5191 17.0697C16.486 17.1862 16.4514 17.3015 16.4075 17.4146C23.2767 17.2954 32.0176 17.138 38.7872 17.0001C38.7574 16.8876 38.7384 16.7737 38.7194 16.6585C38.7004 16.5447 38.6895 16.4309 38.6822 16.3158C38.6772 16.2354 38.6674 16.1565 38.6674 16.0748C38.6674 13.6173 41.1352 11.6178 44.1683 11.6178C47.1586 11.6178 49.595 13.5623 49.6628 15.973C49.6628 16.0065 49.6694 16.0405 49.6694 16.0748C49.6694 16.1611 49.6595 16.2455 49.6528 16.3312C49.6445 16.453 49.6296 16.5742 49.6098 16.6934C50.9023 16.5206 51.8744 15.9689 52.4371 15.0763C53.3999 13.5503 52.9091 11.4839 52.5635 11.0452C52.377 10.8077 52.2844 9.87964 52.2019 9.06107Z"
                  fill="white"
                />
                <Path
                  d="M6.891 17.5762C7.60796 18.9114 9.2481 19.8454 11.1597 19.8454C13.14 19.8454 14.8268 18.8417 15.4995 17.4302C15.5528 17.3177 15.6004 17.2025 15.6409 17.0847C15.6797 16.9722 15.7119 16.857 15.7384 16.7404C15.7855 16.5242 15.8152 16.3018 15.8152 16.0743C15.8152 13.9912 13.7317 12.303 11.1605 12.303C8.5894 12.303 6.50586 13.9912 6.50586 16.0743C6.50586 16.3569 6.5472 16.632 6.6203 16.8972C6.65126 17.0124 6.68845 17.1255 6.73346 17.236C6.77943 17.3526 6.83194 17.465 6.891 17.5762Z"
                  fill="white"
                />
                <Path
                  d="M39.6541 16.9815C40.1566 18.6247 41.9849 19.8453 44.1683 19.8453C46.4511 19.8453 48.3463 18.5122 48.7429 16.7557C48.7684 16.6419 48.7882 16.5273 48.8023 16.4102C48.8147 16.2991 48.823 16.1879 48.823 16.0741C48.823 16.0714 48.823 16.0687 48.823 16.0653C48.8181 13.9869 46.7353 12.3027 44.1683 12.3027C41.598 12.3027 39.5137 13.991 39.5137 16.0741C39.5137 16.1497 39.5228 16.2233 39.5277 16.2983C39.536 16.4142 39.5501 16.5279 39.5715 16.6405C39.593 16.7559 39.6211 16.8696 39.6541 16.9815Z"
                  fill="white"
                />
              </Svg>
            )}
          </View>

          <Text style={tw.style(`text-lg text-[#DADADA]`, { fontFamily: "RobotoBold" })}>
            ₦
            {(() => {
              const cost =
                itemData?.cost ||
                itemData?.fare?.totalFare ||
                itemData?.fare ||
                rideUtils?.distanceTime?.cost ||
                (ride?.data as any)?.fare?.totalFare ||
                (ride?.data as any)?.cost;
              if (cost) {
                const numCost = typeof cost === "string" ? parseFloat(cost) : cost;
                return isNaN(numCost) ? "0" : Math.round(numCost).toLocaleString();
              }
              return "0";
            })()}
          </Text>
          <Text style={tw.style(`text-xs text-[#DADADA] mt-0`, { fontFamily: "RobotoMedium" })}>
            {(() => {
              let distance: string | number | undefined;
              if (itemData?.trip_distance?.text) distance = itemData.trip_distance.text;
              else if (itemData?.trip_distance) distance = itemData.trip_distance;
              else if (rideUtils?.distanceTime?.distance?.text) distance = rideUtils.distanceTime.distance.text;
              else if (rideUtils?.distanceTime?.distance) distance = rideUtils.distanceTime.distance;
              else if ((ride?.data as any)?.distance?.value) distance = `${(ride.data as any).distance.value} km`;
              else if ((ride?.data as any)?.distance) {
                const rideDistance = (ride.data as any).distance;
                if (typeof rideDistance === "object" && rideDistance.value) distance = `${rideDistance.value} km`;
                else if (typeof rideDistance === "string" || typeof rideDistance === "number") distance = rideDistance;
              }
              if (distance) return typeof distance === "string" ? distance : `${distance} km`;
              return "0 km";
            })()}
            <Text style={tw.style(`text-base-green`)}>
              {(() => {
                let duration: string | number | undefined;
                if (itemData?.trip_duration?.text) duration = itemData.trip_duration.text;
                else if (itemData?.trip_duration) duration = itemData.trip_duration;
                else if (rideUtils?.distanceTime?.duration?.text) duration = rideUtils.distanceTime.duration.text;
                else if (rideUtils?.distanceTime?.duration) duration = rideUtils.distanceTime.duration;
                else if ((ride?.data as any)?.duration?.estimated) duration = `${(ride.data as any).duration.estimated} min`;
                else if ((ride?.data as any)?.duration) {
                  const rideDuration = (ride.data as any).duration;
                  if (typeof rideDuration === "object" && rideDuration.estimated) duration = `${rideDuration.estimated} min`;
                  else if (typeof rideDuration === "string" || typeof rideDuration === "number") duration = rideDuration;
                }
                if (duration) return typeof duration === "string" ? duration : `${duration} min`;
                return "0 min";
              })()}
            </Text>
          </Text>
        </View>

        <View style={[tw`flex-row gap-x-2 items-center`, { marginLeft: 20, flex: 1 }]}>
          <View style={tw`flex-1 items-end pr-2`}>
            <Text
              style={tw.style(`text-base text-[#F9F0FF] text-right mb-0.5`, { fontFamily: "RobotoBold" })}
              numberOfLines={1}
            >
              {itemData?.name || itemData?.driver_name || itemData?.user?.name || "Driver"}
            </Text>
            <View style={tw`flex-row items-center gap-x-1.5 self-end mb-0.5`}>
              <Ionicons name="star" size={14} color={tw.color("base-green") || "#00C853"} />
              <Text style={tw.style(`text-sm text-[#F9F0FF]`, { fontFamily: "RobotoMedium" })}>
                {typeof itemData?.rating === "object" && itemData?.rating?.average !== undefined
                  ? itemData.rating.average.toFixed(1)
                  : typeof itemData?.rating === "number"
                    ? itemData.rating.toFixed(1)
                    : "0.0"}
              </Text>
            </View>
            {itemData?.distance && (
              <Text style={tw.style(`text-xs text-[#999] text-right`, { fontFamily: "RobotoRegular" })}>
                {parseFloat(String(itemData.distance)).toFixed(1)} km away
              </Text>
            )}
            {(itemData?.vehicle_number || itemData?.vehicle_type_name) && (
              <Text
                style={tw.style(`text-xs text-[#999] text-right mt-0.5`, { fontFamily: "RobotoRegular" })}
                numberOfLines={1}
              >
                {itemData?.vehicle_type_name ? `${itemData.vehicle_type_name}${itemData?.vehicle_number ? " • " : ""}` : ""}
                {itemData?.vehicle_number || ""}
              </Text>
            )}
          </View>
          <View
            style={[
              tw`h-14 w-14 rounded-full bg-gray-200 border-2 border-white justify-center items-center`,
              { marginRight: -8 },
            ]}
          >
            {itemData?.profile_image || itemData?.driver_image || itemData?.user?.profileImage ? (
              <Image
                source={{
                  uri: itemData.profile_image || itemData.driver_image || itemData.user?.profileImage,
                }}
                style={tw`h-full w-full rounded-full`}
                resizeMode="cover"
              />
            ) : (
              <AntDesign name="user" size={24} color="#999" />
            )}
          </View>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={tw.color("base-green") || "#00C853"}
              />
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
});

interface Props {
  action: () => void;
  request?: (
    driverId: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  reassign?: (
    item: string,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  isActive?: boolean;
  back?: () => void;
  /** Return user to location step (e.g. setStep(1) in find-ride). */
  onChangeLocation?: () => void;
  /**
   * Room available inside the sheet. Caps the content so the list shrinks and
   * scrolls instead of pushing the sticky Request button past the sheet's edge.
   * Mirrors the step-2 (SelectVehicleView) contract.
   */
  maxContentHeight?: number;
  /**
   * Bottom padding for the sticky Request footer. Clears the gesture pill /
   * 3-button nav bar even when the OS reports a zero bottom inset.
   */
  footerReserve?: number;
}

const REQUEST_RIDE_BUTTON_HEIGHT = 52;

const DriverViewComponent = ({
  action: _action,
  request = () => {},
  reassign = () => {},
  isActive = false,
  back,
  onChangeLocation,
  maxContentHeight,
  footerReserve,
}: Props) => {
  const { ride } = useSelector(AppDetailsState);
  const dispatch = useDispatch();
  const rideUtils = ride?.utils as any;
  const rawData = rideUtils?.drivers;
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isFocused = useIsFocused();

  const insets = useCombinedSafeInsets();
  const footerPad = footerReserve ?? sheetFooterBottomPadding(insets.bottom);
  const footerTopGap = 8;
  const stickyFooterHeight = footerTopGap + REQUEST_RIDE_BUTTON_HEIGHT + footerPad;
  const listOverflows = listContentHeight > listViewportHeight + 1;

  useEffect(() => {
    const hasDrivers = rawData && Array.isArray(rawData) && rawData.length > 0;
    if (hasDrivers) setSearching(false);
  }, [rawData]);

  // Driver search with request manager
  useEffect(() => {
    const hasDrivers = rawData && Array.isArray(rawData) && rawData.length > 0;
    if (hasDrivers) {
      setSearching(false);
      return;
    }

    const rideData = ride?.data as any;
    const rideUtilsLocal = ride?.utils as any;
    const origin = rideData?.origin;
    const vehicleTypeId = rideData?.vehicle_type_id;
    const waitingOrigin = rideData?.waiting?.origin;
    const userLoc = rideUtilsLocal?.user_location;

    const toNumber = (v: any): number => {
      if (v == null) return NaN;
      if (typeof v === "number") return v;
      return parseFloat(String(v));
    };
    const toValidCoord = (v: any): number | null => {
      const n = toNumber(v);
      return !Number.isNaN(n) && n !== 0 ? n : null;
    };
    const pickFirstValidCoord = (candidates: any[]): number | null => {
      for (const c of candidates) {
        const v = toValidCoord(c);
        if (v != null) return v;
      }
      return null;
    };

    const originLat =
      pickFirstValidCoord([
        origin?.lat,
        origin?.latitude,
        origin?.location?.lat,
        origin?.geometry?.location?.lat,
        origin?.lng,
        waitingOrigin?.lat,
        waitingOrigin?.latitude,
        waitingOrigin?.location?.lat,
        waitingOrigin?.geometry?.location?.lat,
        userLoc?.lat,
        userLoc?.latitude,
      ]) ?? NaN;
    const originLong =
      pickFirstValidCoord([
        origin?.long,
        origin?.longitude,
        origin?.lng,
        origin?.location?.long,
        origin?.location?.lng,
        origin?.geometry?.location?.lng,
        waitingOrigin?.long,
        waitingOrigin?.longitude,
        waitingOrigin?.lng,
        waitingOrigin?.location?.long,
        waitingOrigin?.location?.lng,
        waitingOrigin?.geometry?.location?.lng,
        userLoc?.long,
        userLoc?.longitude,
        userLoc?.lng,
      ]) ?? NaN;

    const hasValidOrigin = !Number.isNaN(originLat) && !Number.isNaN(originLong);

    if (!isFocused) {
      setSearching(false);
      return;
    }

    if (!hasValidOrigin || !vehicleTypeId) {
      setSearching(false);
      return;
    }

    const searchDrivers = async () => {
      setSearching(true);
      try {
        const cacheKey = `find-drivers-${originLat}-${originLong}-${vehicleTypeId}`;
        const responseData = await requestManager.execute(
          cacheKey,
          async () => {
            const response = await apiClient.get("booking/find-driver", {
              params: {
                loc_lat: originLat,
                loc_long: originLong,
                vehicleTypeId: vehicleTypeId,
              },
            });
            return response.data;
          },
          10000
        );

        const drivers = responseData?.data?.drivers || [];
        dispatch(setRideUtils({ drivers }));
      } catch (err: any) {
        if (hasDrivers) {
          setSearching(false);
          return;
        }
        const errorMessage = getErrorMessage(err);
        dispatch(setRideUtils({ drivers: [] }));
        if (errorMessage && !errorMessage.toLowerCase().includes("too many")) {
          showMessage({ type: "danger", message: errorMessage, duration: 4000 });
        }
      } finally {
        setSearching(false);
      }
    };

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      searchDrivers();
    });

    return () => {
      interactionTask.cancel();
      setSearching(false);
    };
  }, [isFocused, ride?.data, dispatch]);

  const data = useMemo(() => {
    if (!rawData || !Array.isArray(rawData)) return [];
    const filtered = rawData.filter(
      (driver: any) => driver && (driver.driver_id || driver.user_id || driver.name)
    );
    return filtered.sort((a: any, b: any) => {
      const distanceA = parseFloat(String(a.distance)) || 9999;
      const distanceB = parseFloat(String(b.distance)) || 9999;
      return distanceA - distanceB;
    });
  }, [rawData]);

  // Auto-select the first driver so the Request button is live from the start.
  // If the user taps another driver, we honor that. If the selected driver
  // disappears from the list (e.g. went offline), fall back to the first.
  useEffect(() => {
    if (!data.length) {
      if (selectedDriverId) setSelectedDriverId(null);
      return;
    }
    const stillPresent = selectedDriverId
      ? data.some((d: any) => d.driver_id === selectedDriverId)
      : false;
    if (!stillPresent) {
      setSelectedDriverId(data[0].driver_id);
    }
  }, [data, selectedDriverId]);

  const handleSelect = useCallback((driverId: string) => {
    setSelectedDriverId((prev) => (prev === driverId ? null : driverId));
    dispatch(setRideUtils({ driver_id: driverId }));
  }, [dispatch]);

  const handleRequestOrReassign = useCallback(() => {
    if (!selectedDriverId) return;
    const item = data.find((d: any) => d.driver_id === selectedDriverId);
    if (!item) return;

    if (isActive) {
      reassign(selectedDriverId, setLoading);
      return;
    }

    // Normal request flow: validate destination, dispatch, then call parent.
    const rideData = ride?.data as any;
    const hasDestination =
      rideData?.destination &&
      (rideData.destination.lat || rideData.destination.latitude) &&
      (rideData.destination.long || rideData.destination.longitude);

    if (!hasDestination) {
      showMessage({
        type: "warning",
        message: "Please select a destination location first.",
      });
      return;
    }

    dispatch(setRideData({ driver_id: selectedDriverId }));
    dispatch(setRideUtils({ driver: item }));
    request(selectedDriverId, setLoading);
  }, [selectedDriverId, data, isActive, ride?.data, dispatch, request, reassign]);

  const handleRetry = async () => {
    setSearching(true);
    const rideData = ride?.data as any;
    const rideUtilsLocal = ride?.utils as any;
    const origin = rideData?.origin;
    const vehicleTypeId = rideData?.vehicle_type_id;
    const waitingOrigin = rideData?.waiting?.origin;
    const userLoc = rideUtilsLocal?.user_location;

    const toNumber = (v: any): number => {
      if (v == null) return NaN;
      if (typeof v === "number") return v;
      return parseFloat(String(v));
    };
    const toValidCoord = (v: any): number | null => {
      const n = toNumber(v);
      return !Number.isNaN(n) && n !== 0 ? n : null;
    };
    const pickFirstValidCoord = (candidates: any[]): number | null => {
      for (const c of candidates) {
        const v = toValidCoord(c);
        if (v != null) return v;
      }
      return null;
    };

    const originLat =
      pickFirstValidCoord([
        origin?.lat,
        origin?.latitude,
        origin?.location?.lat,
        origin?.geometry?.location?.lat,
        origin?.lng,
        waitingOrigin?.lat,
        waitingOrigin?.latitude,
        waitingOrigin?.location?.lat,
        waitingOrigin?.geometry?.location?.lat,
        userLoc?.lat,
        userLoc?.latitude,
      ]) ?? NaN;
    const originLong =
      pickFirstValidCoord([
        origin?.long,
        origin?.longitude,
        origin?.lng,
        origin?.location?.long,
        origin?.location?.lng,
        origin?.geometry?.location?.lng,
        waitingOrigin?.long,
        waitingOrigin?.longitude,
        waitingOrigin?.lng,
        waitingOrigin?.location?.long,
        waitingOrigin?.location?.lng,
        waitingOrigin?.geometry?.location?.lng,
        userLoc?.long,
        userLoc?.longitude,
        userLoc?.lng,
      ]) ?? NaN;
    const hasValid = !Number.isNaN(originLat) && !Number.isNaN(originLong);

    if (!hasValid || !vehicleTypeId) {
      setSearching(false);
      showMessage({
        type: "warning",
        message: "Missing pickup location or vehicle type",
        duration: 3000,
      });
      return;
    }

    try {
      const cacheKey = `find-drivers-${originLat}-${originLong}-${vehicleTypeId}`;
      requestManager.clear(cacheKey);
      const response = await apiClient.get("booking/find-driver", {
        params: {
          loc_lat: originLat,
          loc_long: originLong,
          vehicleTypeId: vehicleTypeId,
        },
      });
      const drivers = response?.data?.data?.drivers || [];
      if (drivers.length > 0) {
        dispatch(setRideUtils({ drivers }));
        showMessage({
          type: "success",
          message: `Found ${drivers.length} driver${drivers.length !== 1 ? "s" : ""}`,
          duration: 2000,
        });
      } else {
        showMessage({
          type: "info",
          message: "No drivers available nearby. Please try again later.",
          duration: 3000,
        });
      }
    } catch (err: any) {
      showMessage({ type: "danger", message: getErrorMessage(err), duration: 5000 });
    } finally {
      setSearching(false);
    }
  };

  const hasValidData = Array.isArray(data) && data.length > 0;

  const renderDriverItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <ListItem
        item={item}
        onSelect={handleSelect}
        isSelected={selectedDriverId === item?.driver_id}
        isLast={index === data.length - 1}
      />
    ),
    [handleSelect, selectedDriverId, data.length]
  );

  const driverKeyExtractor = useCallback(
    (item: any, index: number) =>
      item?.driver_id || item?.user_id || `driver-${index}`,
    []
  );

  // Pin an explicit height once we know natural content size. `maxHeight` alone
  // is not enough: the parent BottomSheet is a fixed-height box, and a child
  // that only has maxHeight can still be measured at the cap — which is why
  // PR #5 still left a large gap under a single card.
  const footerBlock = selectedDriverId ? stickyFooterHeight : footerPad;
  const naturalHeight = headerHeight + listContentHeight + footerBlock;
  const hasNaturalMeasure = headerHeight > 0 && listContentHeight > 0;
  const contentCapped =
    typeof maxContentHeight === "number" &&
    maxContentHeight > 0 &&
    hasNaturalMeasure &&
    naturalHeight > maxContentHeight + 1;
  const wrapperStyle = useMemo(() => {
    if (hasNaturalMeasure) {
      const height = contentCapped ? (maxContentHeight as number) : naturalHeight;
      return { height, maxHeight: maxContentHeight, flexGrow: 0, flexShrink: 0 };
    }
    if (typeof maxContentHeight === "number" && maxContentHeight > 0) {
      return { maxHeight: maxContentHeight, flexGrow: 0 };
    }
    return { flexGrow: 0 };
  }, [hasNaturalMeasure, contentCapped, maxContentHeight, naturalHeight]);

  // Loading
  if (searching && !hasValidData) {
    return (
      <View
        style={[
          styles.wrapper,
          wrapperStyle,
          tw`flex-1 justify-center items-center py-20 px-6`,
          { minHeight: 400 },
        ]}
      >
        <ActivityIndicator color={tw.color("base-green")} size="large" />
        <Text
          style={tw.style(`text-lg text-center text-[#666] mt-4`, { fontFamily: "RobotoBold" })}
        >
          Finding available drivers...
        </Text>
        <Text
          style={tw.style(`text-sm text-center text-[#999] mt-2`, { fontFamily: "RobotoRegular" })}
        >
          This may take a few moments
        </Text>
      </View>
    );
  }

  // Empty state
  if (!searching && !hasValidData) {
    return (
      <View
        style={[
          styles.wrapper,
          wrapperStyle,
          tw`flex-1 bg-white`,
          { minHeight: 460 },
        ]}
      >
        <NoDriversScreen
          onRetry={handleRetry}
          onBack={back}
          onChangeLocation={onChangeLocation}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      <View
        style={styles.header}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setHeaderHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
        }}
      >
        <Text style={styles.headerTitle}>Available Drivers</Text>
        <Text style={styles.headerSubtitle}>
          {data.length} driver{data.length !== 1 ? "s" : ""} found nearby
        </Text>
      </View>

      <FlatList
        style={[
          styles.scrollView,
          contentCapped ? { flex: 1, minHeight: 0 } : { flexGrow: 0 },
        ]}
        contentContainerStyle={styles.scrollContent}
        data={data}
        renderItem={renderDriverItem}
        keyExtractor={driverKeyExtractor}
        showsVerticalScrollIndicator={contentCapped || listOverflows}
        scrollEnabled={contentCapped || listOverflows}
        nestedScrollEnabled={contentCapped || listOverflows}
        removeClippedSubviews
        maxToRenderPerBatch={4}
        windowSize={3}
        initialNumToRender={3}
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          setListViewportHeight((p) => (Math.abs(p - next) > 1 ? next : p));
        }}
        onContentSizeChange={(_, h) => {
          setListContentHeight((p) => (Math.abs(p - h) > 1 ? h : p));
        }}
      />

      {/* Sticky footer: sibling of the list, visible once a driver is selected. */}
      {selectedDriverId && (
        <View
          style={[
            styles.requestButtonWrapper,
            { paddingBottom: footerPad, flexGrow: 0, flexShrink: 0 },
          ]}
        >
          <TouchableOpacity
            style={styles.requestButton}
            onPress={handleRequestOrReassign}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Text style={styles.requestButtonText}>
                  {isActive ? "Reassign Driver" : "Request Ride"}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="white"
                  style={{ marginLeft: 6 }}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const DriverView = memo(DriverViewComponent);

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    width: "100%",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#666",
    fontFamily: "RobotoRegular",
  },
  scrollView: {
    backgroundColor: "#fff",
    width: "100%",
  },
  scrollContent: {
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  selectedBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 11,
    padding: 1,
  },
  requestButtonWrapper: {
    paddingTop: 8,
    paddingHorizontal: 4,
    backgroundColor: "#fff",
  },
  requestButton: {
    height: REQUEST_RIDE_BUTTON_HEIGHT,
    backgroundColor: tw.color("base-green") || "#3C8F7C",
    borderRadius: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: tw.color("base-green") || "#3C8F7C",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  requestButtonText: {
    color: "#fff",
    fontFamily: "RobotoBold",
    fontSize: 16,
    fontWeight: "700",
  },
});
