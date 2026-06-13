import { AntDesign, Entypo, FontAwesome, Fontisto } from "@expo/vector-icons";
import { AppDetailsState, setRideData, type IUtils, type IRide } from "@/store/AppSlice";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Text, TextInput, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { ScrollView, TouchableOpacity } from "react-native-gesture-handler";
import CustomPlacesAutocomplete from "@/components/CustomPlacesAutocomplete";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { AppContext } from "@/app/context";
import { GET_RECENT_PLACES, SAVE_RECENT_PLACE } from "@/constants";
import {
  fetchRecentPlacesCached,
  invalidateRecentPlacesCache,
  subscribeRecentPlaces,
} from "@/utils/recentPlacesCache";
import { formatAddressForDisplay } from "@/utils/formatAddressForDisplay";
import { geocodeAddress, resolvePickupLabel } from "@/utils/mapsApi";
import apiClient from "@/utils/apiClient";
import { getCachedWallet, setCachedWallet } from "@/utils/walletCache";
import { router } from "expo-router";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import { AuthState } from "@/store/AuthSlice";

interface Props {
  action: () => void;
  back?: () => void;
  initialDropoff?: {
    name: string;
    lat: number | null;
    lng: number | null;
  } | null;
  /** Find Ride renders inside a Portal; `useIsFocused()` can stay false while the sheet is open. */
  locationSheetActive?: boolean;
}

export const LocationView = ({ action, back, initialDropoff, locationSheetActive = false }: Props) => {
  const insets = useCombinedSafeInsets();
  const isFocused = useIsFocused();
  const screenLive = isFocused || locationSheetActive;
  const dispatch = useDispatch();
  const { ride } = useSelector(AppDetailsState);
  const { user } = useSelector(AuthState);
  const { location: currentLocation, address: currentAddress } = useCurrentLocation({
    purpose: "rider",
    isFocused: screenLive,
  });
  const { apiConfig } = useContext(AppContext);
  const [selected, setSelected] = useState<{
    pickup: string;
    dropoff: string;
  }>({
    pickup: "",
    dropoff: "",
  });
  const [recentPlaces, setRecentPlaces] = useState<any[]>([]);
  const [editingPickup, setEditingPickup] = useState(false);
  const [editingDropoff, setEditingDropoff] = useState(false);
  const [farePreview, setFarePreview] = useState<any | null>(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareError, setFareError] = useState<string | null>(null);
  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const [nonWalletPaymentAvailable, setNonWalletPaymentAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get("config/public", { timeout: 10000 })
      .then(({ data }) => {
        if (!mounted) return;
        const enabled: string[] = data?.data?.paymentMethods?.enabled || ["wallet"];
        setNonWalletPaymentAvailable(enabled.some((method) => method !== "wallet"));
      })
      .catch(() => {
        if (!mounted) return;
        setNonWalletPaymentAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const initialDropoffName = initialDropoff?.name?.trim();
    if (!screenLive || !initialDropoffName) return;

    const hasValidCoords =
      initialDropoff?.lat != null &&
      initialDropoff?.lng != null &&
      Number.isFinite(initialDropoff.lat) &&
      Number.isFinite(initialDropoff.lng) &&
      initialDropoff.lat !== 0 &&
      initialDropoff.lng !== 0;

    setEditingDropoff(false);
    setSelected((prev) => ({ ...prev, dropoff: initialDropoffName }));

    if (hasValidCoords) {
      dispatch(
        setRideData({
          destination: {
            name: initialDropoffName,
            long: String(initialDropoff.lng),
            lat: String(initialDropoff.lat),
          },
        })
      );
      return;
    }

    dispatch(
      setRideData({
        destination: {
          name: initialDropoffName,
          long: "",
          lat: "",
        },
      })
    );

    let cancelled = false;

    geocodeAddress(initialDropoffName)
      .then((result) => {
        const firstResult = result?.results?.[0];
        const resolvedLat = firstResult?.geometry?.location?.lat;
        const resolvedLng = firstResult?.geometry?.location?.lng;

        if (
          cancelled ||
          !Number.isFinite(resolvedLat) ||
          !Number.isFinite(resolvedLng) ||
          resolvedLat === 0 ||
          resolvedLng === 0
        ) {
          return;
        }

        dispatch(
          setRideData({
            destination: {
              name: initialDropoffName,
              long: String(resolvedLng),
              lat: String(resolvedLat),
            },
          })
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [screenLive, initialDropoff?.name, initialDropoff?.lat, initialDropoff?.lng, dispatch]);

  useEffect(() => {
    if (!screenLive) return;
    // When user tapped "Change", don't refill from current location (avoids infinite loop)
    if (editingPickup) return;

    if (currentLocation.latitude === 0 || currentLocation.longitude === 0) {
      const userLocation = (ride?.utils as IUtils | undefined)?.user_location;
      if (userLocation && "lat" in userLocation && userLocation.lat) {
        const stored = userLocation as { lat: string; long: string; name?: string; formatted_address?: string };
        const name = stored.name || stored.formatted_address || "Selected location";
        if (!selected.pickup || selected.pickup === "" || selected.pickup === "Enter pick up location") {
          setSelected((prev) => ({ ...prev, pickup: name }));
          dispatch(setRideData({ origin: { name, lat: stored.lat, long: stored.long } }));
        }
      }
      return;
    }

    const fromHook = currentAddress?.formattedAddress ||
      (currentAddress?.street && currentAddress?.city
        ? `${currentAddress.street}, ${currentAddress.city}`
        : "");
    // Skip Expo address if it's just region/country (e.g. "Ebonyi, Nigeria") - we'll use backend for precise address
    const isBroadExpoAddress =
      typeof fromHook === "string" &&
      /^[^,]+,?\s*Nigeria\s*$/i.test(fromHook.trim());
    const hasReadableName =
      typeof fromHook === "string" &&
      fromHook.length > 0 &&
      !fromHook.includes("Current Location") &&
      !isBroadExpoAddress;

    const preciseLocation = {
      place_id: null,
      name: hasReadableName ? fromHook : "Current location",
      formatted_address: hasReadableName ? fromHook : "Current location",
      long: String(currentLocation.longitude),
      lat: String(currentLocation.latitude),
    };

    const rideData = ride?.data as IRide | undefined;
    const reduxOrigin = rideData?.origin as
      | { lat?: string | number; long?: string | number; lng?: string | number; latitude?: string | number; longitude?: string | number }
      | undefined;
    const oLat = parseFloat(
      String(reduxOrigin?.lat ?? reduxOrigin?.latitude ?? "")
    );
    const oLng = parseFloat(
      String(
        reduxOrigin?.long ??
          reduxOrigin?.lng ??
          reduxOrigin?.longitude ??
          ""
      )
    );
    const hasConcretePickupCoords =
      Number.isFinite(oLat) &&
      Number.isFinite(oLng) &&
      oLat !== 0 &&
      oLng !== 0;
    const plat = Number(preciseLocation.lat);
    const plng = Number(preciseLocation.long);
    const isSameLocation =
      hasConcretePickupCoords &&
      Math.abs(oLat - plat) < 1e-7 &&
      Math.abs(oLng - plng) < 1e-7;
    // Don't overwrite when user already chose a real pickup elsewhere (empty draft lat/long must NOT block GPS default)
    const hasOtherOrigin = hasConcretePickupCoords && !isSameLocation;
    if (hasOtherOrigin) return;

    if (!isSameLocation) {
      setSelected((prev) => ({ ...prev, pickup: preciseLocation.name }));
      dispatch(setRideData({ origin: preciseLocation }));
    } else if (!selected.pickup || selected.pickup === "" || selected.pickup === "Enter pick up location") {
      setSelected((prev) => ({ ...prev, pickup: preciseLocation.name }));
    }

    if (hasReadableName) return;

    resolvePickupLabel(currentLocation.latitude, currentLocation.longitude)
      .then((address) => {
        if (address) {
          setSelected((prev) => ({ ...prev, pickup: address }));
          dispatch(
            setRideData({
              origin: {
                name: address,
                long: String(currentLocation.longitude),
                lat: String(currentLocation.latitude),
              },
            })
          );
        }
      })
      .catch(() => {});
  // Intentionally omit ride?.data to avoid loop: this effect dispatches setRideData, which would retrigger the effect.
  }, [screenLive, editingPickup, currentLocation.latitude, currentLocation.longitude, currentAddress?.formattedAddress, currentAddress?.street, currentAddress?.city]);

  const handleUseCurrentLocation = async () => {
    if (currentLocation.latitude === 0 || currentLocation.longitude === 0) {
      showMessage({
        type: "warning",
        message: "Location not available. Please wait or search for a location.",
      });
      return;
    }

    const accuracy = currentLocation.accuracy || 0;
    if (accuracy > 100) {
      showMessage({
        type: "warning",
        message: `Location accuracy is low (${accuracy.toFixed(0)}m). For best results, wait for GPS to lock or search for a location.`,
      });
    }

    const fromHook = currentAddress?.formattedAddress ||
      (currentAddress?.street && currentAddress?.city ? `${currentAddress.street}, ${currentAddress.city}` : "");
    const isBroadExpoAddress =
      typeof fromHook === "string" && /^[^,]+,?\s*Nigeria\s*$/i.test(fromHook.trim());
    const hasReadableName =
      typeof fromHook === "string" &&
      fromHook.length > 0 &&
      !fromHook.includes("Current Location") &&
      !isBroadExpoAddress;

    setEditingPickup(false);
    setSelected((prev) => ({ ...prev, pickup: hasReadableName ? fromHook : "Current location" }));
    dispatch(setRideData({
      origin: {
        name: hasReadableName ? fromHook : "Current location",
        long: String(currentLocation.longitude),
        lat: String(currentLocation.latitude),
      },
    }));

    if (!hasReadableName) {
      try {
        const address = await resolvePickupLabel(currentLocation.latitude, currentLocation.longitude);
        if (address) {
          setSelected((prev) => ({ ...prev, pickup: address }));
          dispatch(
            setRideData({
              origin: {
                name: address,
                long: String(currentLocation.longitude),
                lat: String(currentLocation.latitude),
              },
            })
          );
        }
      } catch (_) {}
    }

    showMessage({ type: accuracy < 20 ? "success" : "info", message: "Using current location" });
  };

  const setLocation = (type: "pickup" | "dropoff", locationData: any, label: string) => {
    // Validate and log location data
    const lat = typeof locationData.lat === 'string' ? parseFloat(locationData.lat) : locationData.lat;
    const lng = typeof locationData.long === 'string' ? parseFloat(locationData.long) : locationData.long;
    
    // Ensure coordinates are valid numbers
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      console.error(`❌ Invalid ${type} location:`, { lat, lng, locationData });
      showMessage({
        type: "danger",
        message: `Invalid ${type} location. Please select again.`,
      });
      return;
    }
    
    // Normalize location data to ensure consistent format
    const normalizedLocation = {
      lat: lat,
      long: lng,
      name: locationData.name || label || '',
      address: locationData.formatted_address || locationData.address || locationData.name || label || '',
      place_id: locationData.place_id || null,
    };
    
    console.log(`✅ Setting ${type} location:`, {
      name: normalizedLocation.name,
      address: normalizedLocation.address,
      lat: normalizedLocation.lat,
      long: normalizedLocation.long,
      place_id: normalizedLocation.place_id,
    });
    
    if (type === "pickup") {
      setEditingPickup(false);
      setSelected((prev) => ({ ...prev, pickup: label }));
      dispatch(setRideData({ origin: normalizedLocation }));
    } else {
      setEditingDropoff(false);
      setSelected((prev) => ({ ...prev, dropoff: label }));
      dispatch(setRideData({ destination: normalizedLocation }));
    }
  };

  const handleQuickSelect = async (locationData: any, label: string) => {
    // If pickup is already set, always set dropoff
    // Otherwise set pickup
    const target: "pickup" | "dropoff" = selected.pickup && selected.pickup !== "" ? "dropoff" : "pickup";
    
    console.log("🎯 Quick select:", { target, label, hasPickup: !!selected.pickup });
    
    setLocation(target, locationData, label);
    
    // Force update the display value
    if (target === "dropoff") {
      setSelected((prev) => ({
        ...prev,
        dropoff: label,
      }));
    }

    // Automatically save destination to recent places when selected
    if (target === "dropoff" && locationData.lat && locationData.long && apiConfig) {
      try {
        await apiClient.post(SAVE_RECENT_PLACE, {
          name: locationData.name || label,
          address: locationData.formatted_address || locationData.address || label,
          latitude: locationData.lat,
          longitude: locationData.long,
          isDefault: false,
        });
        invalidateRecentPlacesCache();
        if (__DEV__) {
          console.log("✅ Destination saved to recent places");
        }
      } catch (error) {
        // Silently fail - don't interrupt user flow
        if (__DEV__) {
          console.log("⚠️ Failed to save destination to recent places:", error);
        }
      }
    }
  };

  useEffect(() => {
    const origin = (ride?.data as any)?.origin;
    const destination = (ride?.data as any)?.destination;
    const oLat = parseFloat(String(origin?.lat ?? origin?.latitude ?? "0"));
    const oLng = parseFloat(
      String(origin?.long ?? origin?.lng ?? origin?.longitude ?? "0")
    );
    const dLat = parseFloat(String(destination?.lat ?? destination?.latitude ?? "0"));
    const dLng = parseFloat(
      String(destination?.long ?? destination?.lng ?? destination?.longitude ?? "0")
    );

    const hasCoords =
      isFinite(oLat) &&
      isFinite(oLng) &&
      isFinite(dLat) &&
      isFinite(dLng) &&
      oLat !== 0 &&
      oLng !== 0 &&
      dLat !== 0 &&
      dLng !== 0;

    if (!screenLive || !hasCoords) {
      setFarePreview(null);
      setFareError(null);
      setFareLoading(false);
      return;
    }

    let mounted = true;
    setFareLoading(true);
    setFareError(null);

    const cachedWallet = getCachedWallet<any>();
    const walletPromise = cachedWallet
      ? Promise.resolve(cachedWallet)
      : apiClient.get("wallet", { timeout: 10000 }).then((res) => {
          setCachedWallet(res);
          return res;
        });
    Promise.all([
      apiClient.get("rides/fare-estimate", {
        params: { originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng },
        timeout: 10000,
      }),
      walletPromise,
    ])
      .then(([fareRes, walletRes]) => {
        if (!mounted) return;
        const fare = fareRes?.data?.data;
        const data = walletRes?.data?.data;
        const available = data?.availableBalance ?? data?.balance;
        const num = typeof available === "number" ? available : Number(available || 0);
        setFarePreview(fare || null);
        setWalletAvailableBalance(Number.isFinite(num) ? num : 0);
      })
      .catch(() => {
        if (!mounted) return;
        setFarePreview(null);
        setWalletAvailableBalance(null);
        setFareError("Unable to load fare preview");
      })
      .finally(() => {
        if (!mounted) return;
        setFareLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [screenLive, (ride?.data as any)?.origin?.lat, (ride?.data as any)?.origin?.long, (ride?.data as any)?.destination?.lat, (ride?.data as any)?.destination?.long]);

  const fareTotal = typeof farePreview?.riderTotal === "number" ? farePreview.riderTotal : Number(farePreview?.riderTotal || 0);
  const walletOk =
    walletAvailableBalance != null &&
    !isNaN(fareTotal) &&
    fareTotal > 0 &&
    walletAvailableBalance >= fareTotal;
  /** When fare is 0 or unknown, do not treat wallet as "insufficient" (walletOk is false for fareTotal===0). */
  const walletInsufficientForRide =
    farePreview != null &&
    walletAvailableBalance != null &&
    fareTotal > 0 &&
    walletAvailableBalance < fareTotal;
  /** Block only when wallet is required (no cash/card/transfer enabled) and balance is low. */
  const walletBlocksBooking = walletInsufficientForRide && !nonWalletPaymentAvailable;
  const shortfall =
    walletAvailableBalance != null && fareTotal > 0
      ? Math.max(0, Math.ceil(fareTotal - walletAvailableBalance))
      : 0;

  useEffect(() => {
    if (!screenLive) return;
    const userId = String(user?.profile?.user_id ?? "");
    if (!userId) return;

    const unsub = subscribeRecentPlaces((fresh) => {
      setRecentPlaces(fresh);
    });

    fetchRecentPlacesCached(userId)
      .then(setRecentPlaces)
      .catch(() => {
        // fetchRecentPlacesCached returns stale cache on failure; only throws if nothing cached
      });

    return unsub;
  }, [screenLive, user?.profile?.user_id]);

  // Deduplicate and limit to 3 most recent (by coordinates and normalized name)
  const recentPlacesDeduped = useMemo(() => {
    const seenCoords = new Set<string>();
    const seenNames = new Set<string>();
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    const normalizeName = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
    const deduped = (recentPlaces || []).filter((item) => {
      const lat = item.location?.latitude ?? item.lat ?? item.latitude;
      const lng = item.location?.longitude ?? item.long ?? item.longitude;
      if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return false;
      const coordKey = `${round(Number(lat))},${round(Number(lng))}`;
      const name = item.name || item.address || item.formatted_address || "";
      const nameKey = normalizeName(name);
      if (seenCoords.has(coordKey) || (nameKey && seenNames.has(nameKey))) return false;
      seenCoords.add(coordKey);
      if (nameKey) seenNames.add(nameKey);
      return true;
    });
    return deduped.slice(0, 3);
  }, [recentPlaces]);

  const ensureDestinationCoordinates = async () => {
    const destination = (ride?.data as any)?.destination;
    const destinationLat = parseFloat(String(destination?.lat ?? destination?.latitude ?? "0"));
    const destinationLng = parseFloat(String(destination?.long ?? destination?.longitude ?? "0"));
    const hasValidCoords =
      Number.isFinite(destinationLat) &&
      Number.isFinite(destinationLng) &&
      destinationLat !== 0 &&
      destinationLng !== 0;

    if (hasValidCoords) return true;
    if (!selected.dropoff || selected.dropoff.trim() === "") return false;

    try {
      const result = await geocodeAddress(selected.dropoff.trim());
      const firstResult = result?.results?.[0];
      const resolvedLat = firstResult?.geometry?.location?.lat;
      const resolvedLng = firstResult?.geometry?.location?.lng;

      if (
        !Number.isFinite(resolvedLat) ||
        !Number.isFinite(resolvedLng) ||
        resolvedLat === 0 ||
        resolvedLng === 0
      ) {
        showMessage({
          type: "warning",
          message: "Please select a valid dropoff location",
        });
        return false;
      }

      dispatch(
        setRideData({
          destination: {
            name: selected.dropoff.trim(),
            long: String(resolvedLng),
            lat: String(resolvedLat),
          },
        })
      );

      return true;
    } catch (_) {
      showMessage({
        type: "warning",
        message: "Please select a valid dropoff location",
      });
      return false;
    }
  };

  return (
    <>
      <View style={tw`flex-row gap-x-3`}>
        <View style={tw`flex-col items-center pt-1`}>
          <Fontisto
            name="radio-btn-active"
            size={20}
            color={tw.color("base-green")}
          />
          <View
            style={tw.style(
              `h-[50px] border-l-2 border-dashed border-[#C8C7CC]`
            )}
          />
          <Entypo name="location-pin" size={24} color="black" />
        </View>

        <View style={tw`flex-col gap-y-3 flex-1 pr-2`}>
          <View style={tw`pb-3 border-b border-[#EFEFEF]`}>
            <View style={tw`flex-row justify-between items-center mb-2`}>
              <Text
                style={tw.style(`text-[13px] text-[#C8C7CC] uppercase`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Pickup
              </Text>
              {currentLocation.latitude !== 0 && (
                <TouchableOpacity
                  onPress={handleUseCurrentLocation}
                  style={tw`flex-row items-center gap-x-1 bg-base-green px-2.5 py-1 rounded-full`}
                >
                  <Entypo name="location" size={12} color="white" />
                  <Text
                    style={tw.style(`text-[10px] text-white`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Use Current
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={tw`pr-2`}>
              {selected.pickup &&
              selected.pickup !== "" &&
              selected.pickup !== "Enter pick up location" &&
              !editingPickup ? (
                <View>
                  <Text
                    numberOfLines={1}
                    style={tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {formatAddressForDisplay(selected.pickup).primary}
                  </Text>
                  {!!formatAddressForDisplay(selected.pickup).secondary && (
                    <Text
                      numberOfLines={1}
                      style={tw.style(`text-xs text-[#8E8E93] mt-0.5`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      {formatAddressForDisplay(selected.pickup).secondary}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setEditingPickup(true);
                      setSelected((prev) => ({ ...prev, pickup: "" }));
                      dispatch(setRideData({ origin: { name: "", long: "", lat: "" } }));
                    }}
                    style={tw`mt-1.5`}
                  >
                    <Text
                      style={tw.style(`text-[13px] text-base-green`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <CustomPlacesAutocomplete
                  placeholder="Enter pick up location"
                  initialValue={selected.pickup}
                  userLat={currentLocation.latitude}
                  userLng={currentLocation.longitude}
                  showClearButton={false}
                  onPlaceSelected={(place) => {
                    Keyboard.dismiss();
                    const displayValue = place.name || place.formatted_address || "Selected location";
                    console.log('📝 Setting pickup display value:', displayValue);
                    setEditingPickup(false);
                    setSelected((prev) => ({ ...prev, pickup: displayValue }));
                    dispatch(setRideData({
                      origin: {
                        name: place.name || displayValue,
                        long: String(place.long),
                        lat: String(place.lat),
                      },
                    }));
                  }}
                  onClear={() => {
                    setSelected((prev) => ({ ...prev, pickup: "" }));
                    dispatch(setRideData({ origin: { name: "", long: "", lat: "" } }));
                  }}
                  styles={{
                    textInput: tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoRegular",
                      borderWidth: 0,
                      backgroundColor: "transparent",
                      paddingVertical: 0,
                      paddingHorizontal: 0,
                    }),
                  }}
                />
              )}
            </View>
          </View>
          <View style={tw`relative`}>
            <Text
              style={tw.style(`text-[13px] text-[#C8C7CC] uppercase mb-2`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Drop-off
            </Text>
            <View style={tw`pr-2`}>
              {selected.dropoff &&
              selected.dropoff !== "" &&
              selected.dropoff !== "Enter drop-off location" &&
              !editingDropoff ? (
                <View>
                  <Text
                    numberOfLines={1}
                    style={tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {formatAddressForDisplay(selected.dropoff).primary}
                  </Text>
                  {!!formatAddressForDisplay(selected.dropoff).secondary && (
                    <Text
                      numberOfLines={1}
                      style={tw.style(`text-xs text-[#8E8E93] mt-0.5`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      {formatAddressForDisplay(selected.dropoff).secondary}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setEditingDropoff(true);
                      setSelected((prev) => ({ ...prev, dropoff: "" }));
                      dispatch(setRideData({ destination: { name: "", long: "", lat: "" } }));
                    }}
                    style={tw`mt-1.5`}
                  >
                    <Text
                      style={tw.style(`text-[13px] text-base-green`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <CustomPlacesAutocomplete
                  placeholder="Enter drop-off location"
                  initialValue={selected.dropoff}
                  userLat={currentLocation.latitude}
                  userLng={currentLocation.longitude}
                  autoFocus={editingDropoff || !selected.dropoff}
                  showClearButton={false}
                  onPlaceSelected={async (place) => {
                    Keyboard.dismiss();
                    const displayValue = place.name || place.formatted_address || "Selected location";
                    const destCoords = { name: place.name || displayValue, long: String(place.long), lat: String(place.lat) };
                    setEditingDropoff(false);
                    setSelected((prev) => ({ ...prev, dropoff: displayValue }));
                    dispatch(setRideData({ destination: destCoords }));

                    if (destCoords.lat && destCoords.long && apiConfig) {
                      try {
                        await apiClient.post(SAVE_RECENT_PLACE, {
                          name: destCoords.name || displayValue,
                          address: place.formatted_address || displayValue,
                          latitude: Number(destCoords.lat),
                          longitude: Number(destCoords.long),
                          isDefault: false,
                        });
                        invalidateRecentPlacesCache();
                        if (__DEV__) console.log("✅ Destination saved to recent places");
                      } catch (error) {
                        if (__DEV__) console.log("⚠️ Failed to save destination to recent places:", error);
                      }
                    }
                  }}
                  onClear={() => {
                    setSelected((prev) => ({ ...prev, dropoff: "" }));
                    dispatch(setRideData({ destination: { name: "", long: "", lat: "" } }));
                  }}
                  styles={{
                    textInput: tw.style(`text-[15px] text-[#242E42]`, {
                      fontFamily: "RobotoRegular",
                      borderWidth: 1,
                      borderColor: "#E0E0E0",
                      backgroundColor: "#F9F9F9",
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      minHeight: 48,
                    }),
                  }}
                />
              )}
            </View>
          </View>

          {/* Live fare preview (non-blocking) */}
          {fareLoading ? (
            <View style={tw`mt-3 bg-white rounded-[12px] border border-[#EFEFEF] p-4`}>
              <View style={tw`flex-row items-center justify-between`}>
                <Text style={tw.style(`text-[13px] text-[#242E42]`, { fontFamily: "RobotoMedium" })}>
                  Keke · Loading…
                </Text>
                <ActivityIndicator size="small" color={tw.color("base-green")} />
              </View>
            </View>
          ) : farePreview ? (
            <View style={tw`mt-3 bg-white rounded-[12px] border border-[#EFEFEF] p-4`}>
              <Text style={tw.style(`text-[13px] text-[#242E42] mb-2`, { fontFamily: "RobotoMedium" })}>
                Keke · {farePreview.distanceKm}km · ~{farePreview.estimatedMins} min
              </Text>
              <View style={tw`gap-y-2`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw.style(`text-[13px] text-[#5A5A5A]`, { fontFamily: "RobotoRegular" })}>
                    Ride fare
                  </Text>
                  <Text style={tw.style(`text-[13px] text-[#242E42]`, { fontFamily: "RobotoMedium" })}>
                    {farePreview.display?.["Ride fare"] || ""}
                  </Text>
                </View>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw.style(`text-[13px] text-[#5A5A5A]`, { fontFamily: "RobotoRegular" })}>
                    Service charge
                  </Text>
                  <Text style={tw.style(`text-[13px] text-[#242E42]`, { fontFamily: "RobotoMedium" })}>
                    {farePreview.display?.["Service charge"] || ""}
                  </Text>
                </View>
                <View style={tw`border-t border-[#EFEFEF] pt-2 flex-row items-center justify-between`}>
                  <Text style={tw.style(`text-[14px] text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                    Total
                  </Text>
                  <View style={tw`flex-row items-center gap-x-2`}>
                    <Text style={tw.style(`text-[14px] text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                      {farePreview.display?.Total || ""}
                    </Text>
                    {walletOk ? (
                      <Entypo name="check" size={16} color={tw.color("base-green")} />
                    ) : null}
                  </View>
                </View>
                {!walletOk && walletAvailableBalance != null && fareTotal > 0 ? (
                  <Text style={tw.style(`text-[12px] text-red-600`, { fontFamily: "RobotoMedium" })}>
                    Insufficient balance — Top up ₦{shortfall.toLocaleString()}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : fareError ? (
            <View style={tw`mt-3 bg-white rounded-[12px] border border-[#EFEFEF] p-4`}>
              <Text style={tw.style(`text-[12px] text-[#8E8E93]`, { fontFamily: "RobotoRegular" })}>
                {fareError}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <ScrollView
        style={tw`mt-4`}
        contentContainerStyle={tw`pb-4`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {recentPlaces.length > 0 && !selected.dropoff && (
          <>
        <Text
          style={tw.style(`text-[13px] text-[#C8C7CC] uppercase mb-2 mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Recent locations
        </Text>
            <View style={tw`bg-white rounded-[12px] border border-[#EFEFEF] mb-4`}>
              {recentPlacesDeduped.map((item, index) => {
                // Extract coordinates from different possible structures
                const lat = item.location?.latitude || item.lat || item.latitude;
                const lng = item.location?.longitude || item.long || item.longitude;
                
                // Only render if we have valid coordinates
                if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
                  return null;
                }
                
                return (
                  <TouchableOpacity
                    key={item.place_id || `recent-${index}`}
                    onPress={() =>
                      handleQuickSelect(
                        {
                          place_id: item.place_id || null,
                          name: item.name || item.address || "",
                          formatted_address: item.formatted_address || item.address || item.name || "",
                          long: typeof lng === 'string' ? parseFloat(lng) : lng,
                          lat: typeof lat === 'string' ? parseFloat(lat) : lat,
                        },
                        item.name || item.address || item.formatted_address || "Recent location"
                      )
                    }
                  style={tw.style(
                    `flex-row items-center gap-x-3 px-3 py-2.5`,
                    index < recentPlacesDeduped.length - 1 && `border-b border-[#EFEFEF]`
                  )}
                >
                  <FontAwesome name="clock-o" size={18} color="#5A5A5A" />
                  <View style={tw`flex-1`}>
                    <Text
                      numberOfLines={1}
                      style={tw.style(`text-[15px] text-[#242E42]`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {item.name || "Recent place"}
                    </Text>
                    {!!item.formatted_address && (
                      <Text
                        numberOfLines={1}
                        style={tw.style(`text-xs text-[#8E8E93] mt-1`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        {item.formatted_address}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>
      
      {/* Fixed Navigation Button */}
      <View
        style={[
          tw`px-5 pt-3 bg-white border-t border-[#F0F0F0]`,
          { paddingBottom: Math.max(insets.bottom + 12, 20) },
        ]}
      >
      <TouchableOpacity
          style={tw.style(
            `flex-row justify-center items-center px-6 py-3.5 rounded-full`,
            selected.pickup && selected.dropoff
              ? (walletBlocksBooking ? `bg-gray-300` : `bg-base-green`)
              : `bg-gray-300`
          )}
          disabled={!selected.pickup || !selected.dropoff || walletBlocksBooking}
        onPress={async () => {
          if (selected.pickup === "") {
            showMessage({
              type: "warning",
              message: "Please select a pickup location",
            });
          } else if (selected.dropoff === "") {
            showMessage({
              type: "warning",
              message: "Please select a dropoff location",
            });
          } else if (walletBlocksBooking) {
            router.push("/(app)/(tabs)/(profile)/wallet");
          } else {
            // Safety: block proceeding when Redux origin coords are missing/invalid.
            // This prevents falling into step 2/3 with `origin.lat/long` as empty strings.
            const reduxRide = (ride?.data as any) || {};
            const oLatRaw = reduxRide?.origin?.lat ?? reduxRide?.origin?.latitude;
            const oLngRaw = reduxRide?.origin?.long ?? reduxRide?.origin?.longitude;
            const oLatNum = oLatRaw != null ? parseFloat(String(oLatRaw)) : NaN;
            const oLngNum = oLngRaw != null ? parseFloat(String(oLngRaw)) : NaN;
            const hasValidOriginCoords =
              Number.isFinite(oLatNum) && Number.isFinite(oLngNum) && oLatNum !== 0 && oLngNum !== 0;

            if (!hasValidOriginCoords) {
              // If Redux origin coords are missing/invalid, populate them from GPS as a fallback
              // so the flow doesn't get stuck (map label can be set without coords).
              const gpsLatNum =
                currentLocation?.latitude != null ? Number(currentLocation.latitude) : NaN;
              const gpsLngNum =
                currentLocation?.longitude != null ? Number(currentLocation.longitude) : NaN;
              const hasValidGpsCoords =
                Number.isFinite(gpsLatNum) &&
                Number.isFinite(gpsLngNum) &&
                gpsLatNum !== 0 &&
                gpsLngNum !== 0;

              if (!hasValidGpsCoords) {
                showMessage({
                  type: "warning",
                  message: "Please select a valid pickup location (coordinates not found).",
                });
                return;
              }

              dispatch(
                setRideData({
                  origin: {
                    name: selected.pickup || "Current location",
                    lat: gpsLatNum.toString(),
                    long: gpsLngNum.toString(),
                  },
                })
              );
            }

            const hasResolvedDropoff = await ensureDestinationCoordinates();
            if (!hasResolvedDropoff) return;
            action();
          }
        }}
      >
          <Text style={tw.style(`text-white text-[16px] mr-2`, { fontFamily: "RobotoBold" })}>
            {walletBlocksBooking ? "Top Up Wallet" : "Confirm Booking"}
          </Text>
          <AntDesign name="right" size={20} color="white" />
      </TouchableOpacity>
      </View>
    </>
  );
};
