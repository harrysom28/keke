import { AntDesign, Entypo, FontAwesome, Fontisto } from "@expo/vector-icons";
import { AppDetailsState, setRideData } from "@/store/AppSlice";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { ScrollView } from "react-native-gesture-handler";
import CustomPlacesAutocomplete from "@/components/CustomPlacesAutocomplete";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { AppContext } from "@/app/context";
import { GET_RECENT_PLACES, SAVE_RECENT_PLACE } from "@/constants";
import apiClient from "@/utils/apiClient";

interface Props {
  action: () => void;
  back?: () => void;
}

export const LocationView = ({ action, back }: Props) => {
  const isFocused = useIsFocused();
  const dispatch = useDispatch();
  const { ride } = useSelector(AppDetailsState);
  const { location: currentLocation, address: currentAddress } = useCurrentLocation({ isFocused });
  const { apiConfig } = useContext(AppContext);
  const [selected, setSelected] = useState<{
    pickup: string;
    dropoff: string;
  }>({
    pickup: "",
    dropoff: "",
  });
  const [recentPlaces, setRecentPlaces] = useState<any[]>([]);

  useEffect(() => {
    if (isFocused) {
      // Always use current location if available - this is the default
      if (currentLocation.latitude !== 0 && currentLocation.longitude !== 0) {
        // Use formatted address if available, otherwise try reverse geocoding
        let locationAddress = currentAddress?.formattedAddress;
        
        // If no formatted address, try to get it via reverse geocoding
        if (!locationAddress || locationAddress.includes('Current Location')) {
          // The useCurrentLocation hook already does reverse geocoding, but if it failed,
          // we'll use coordinates as fallback
          locationAddress = currentAddress?.formattedAddress || 
                           (currentAddress?.street && currentAddress?.city 
                             ? `${currentAddress.street}, ${currentAddress.city}` 
                             : `Current Location (${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)})`);
        }
        
          const preciseLocation = {
            place_id: null,
          name: locationAddress,
          formatted_address: locationAddress,
            long: currentLocation.longitude,
            lat: currentLocation.latitude,
          };
        
        // Always set current location as default pickup
        // Check if Redux already has this location to avoid unnecessary updates
        const reduxOrigin = ride?.data?.origin;
        const isSameLocation = reduxOrigin?.lat === preciseLocation.lat && 
                               reduxOrigin?.long === preciseLocation.long;
        
        if (!isSameLocation) {
          setSelected((prev) => ({
            ...prev,
            pickup: locationAddress,
          }));
          dispatch(setRideData({ origin: preciseLocation }));
          console.log("📍 Auto-set pickup to current location:", {
            lat: preciseLocation.lat,
            lng: preciseLocation.long,
            address: locationAddress,
          });
        } else if (!selected.pickup || selected.pickup === "" || selected.pickup === "Enter pick up location") {
          // If Redux has the location but state doesn't, sync state
          setSelected((prev) => ({
            ...prev,
            pickup: locationAddress,
          }));
        }
          return;
      }
      
      // Fallback to stored user location
      if (ride?.utils?.user_location && ride?.utils?.user_location?.lat) {
        const storedLocation = ride.utils.user_location;
        const storedName = storedLocation.name || storedLocation.formatted_address || "Selected location";
        
        // Only set if pickup is empty or doesn't match stored location
        if (!selected.pickup || selected.pickup === "" || selected.pickup === "Enter pick up location") {
        setSelected((prev) => ({
          ...prev,
            pickup: storedName,
        }));
          dispatch(setRideData({ origin: storedLocation }));
        }
      }
    }
  }, [isFocused, currentLocation.latitude, currentLocation.longitude, currentAddress?.formattedAddress, ride?.data?.origin]);

  const handleUseCurrentLocation = () => {
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

    // Use precise GPS coordinates
    const preciseLocation = {
      place_id: null, // No place_id for current location
      name: currentAddress?.formattedAddress || `Current Location (${accuracy.toFixed(0)}m accuracy)`,
      formatted_address: currentAddress?.formattedAddress || `Lat: ${currentLocation.latitude.toFixed(6)}, Lng: ${currentLocation.longitude.toFixed(6)}`,
      long: currentLocation.longitude,
      lat: currentLocation.latitude,
    };

    console.log("📍 Using precise current location:", {
      lat: preciseLocation.lat,
      lng: preciseLocation.long,
      accuracy: `${accuracy.toFixed(0)}m`,
      address: preciseLocation.name,
    });

    setSelected((prev) => ({
      ...prev,
      pickup: currentAddress?.formattedAddress || `Current Location (${accuracy.toFixed(0)}m)`,
    }));
    dispatch(setRideData({ origin: preciseLocation }));

    showMessage({
      type: accuracy < 20 ? "success" : "info",
      message: `Using current location (${accuracy.toFixed(0)}m accuracy)`,
    });
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
      setSelected((prev) => ({ ...prev, pickup: label }));
      dispatch(setRideData({ origin: normalizedLocation }));
    } else {
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
    if (!isFocused || !apiConfig) return;
    apiClient
      .get(GET_RECENT_PLACES)
      .then(({ data }) => {
        const list = data?.data?.recent_places;
        setRecentPlaces(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.log("Error fetching recent places:", err?.response?.data || err?.message);
      });
  }, [isFocused, apiConfig]);



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
              <CustomPlacesAutocomplete
                placeholder="Enter pick up location"
                initialValue={selected.pickup}
                showClearButton={false}
                onPlaceSelected={(place) => {
                  console.log('🎯 Pickup place selected:', place);
                  const locationData = {
                    place_id: place.place_id || null,
                    name: place.name || "",
                    formatted_address: place.formatted_address || place.name || "",
                    long: place.long,
                    lat: place.lat,
                  };
                  // Use place.name as the display value for consistency
                  const displayValue = place.name || place.formatted_address || "Selected location";
                  console.log('📝 Setting pickup display value:', displayValue);
                  setSelected((prev) => ({
                    ...prev,
                    pickup: displayValue,
                  }));
                  dispatch(setRideData({ origin: locationData }));
                }}
                onClear={() => {
                  setSelected((prev) => ({ ...prev, pickup: "" }));
                  dispatch(setRideData({ origin: {} }));
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
              <CustomPlacesAutocomplete
                placeholder="Enter drop-off location"
                initialValue={selected.dropoff}
                showClearButton={false}
                onPlaceSelected={async (place) => {
                  console.log('🎯 Drop-off place selected:', place);
                  const locationData = {
                    place_id: place.place_id || null,
                    name: place.name || "",
                    formatted_address: place.formatted_address || place.name || "",
                    long: place.long,
                    lat: place.lat,
                  };
                  // Use place.name as the display value - it should match what CustomPlacesAutocomplete set
                  const displayValue = place.name || place.formatted_address || "Selected location";
                  console.log('📝 Setting dropoff display value:', displayValue, 'from place:', place);
                  
                  // Update state immediately
                  setSelected((prev) => ({
                    ...prev,
                    dropoff: displayValue,
                  }));
                  dispatch(setRideData({ destination: locationData }));

                  // Automatically save destination to recent places
                  if (locationData.lat && locationData.long && apiConfig) {
                    try {
                      await apiClient.post(SAVE_RECENT_PLACE, {
                        name: locationData.name || displayValue,
                        address: locationData.formatted_address || locationData.address || displayValue,
                        latitude: locationData.lat,
                        longitude: locationData.long,
                        isDefault: false,
                      });
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
                }}
                onClear={() => {
                  setSelected((prev) => ({ ...prev, dropoff: "" }));
                  dispatch(setRideData({ destination: {} }));
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
            </View>
          </View>
        </View>
      </View>
      <ScrollView
        style={tw`mt-4`}
        contentContainerStyle={tw`pb-4`}
        showsVerticalScrollIndicator={false}
      >
        {recentPlaces.length > 0 && (
          <>
        <Text
          style={tw.style(`text-[13px] text-[#C8C7CC] uppercase mb-2 mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Recent locations
        </Text>
            <View style={tw`bg-white rounded-[12px] border border-[#EFEFEF] mb-4`}>
              {recentPlaces.map((item, index) => {
                // Extract coordinates from different possible structures
                const lat = item.location?.latitude || item.lat || item.latitude;
                const lng = item.location?.longitude || item.long || item.longitude;
                
                // Only render if we have valid coordinates
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                  console.warn('⚠️ Recent place missing coordinates:', item);
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
                    index < recentPlaces.length - 1 && `border-b border-[#EFEFEF]`
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
      <View style={tw`px-5 pb-5 pt-3 bg-white border-t border-[#F0F0F0]`}>
      <TouchableOpacity
          style={tw.style(
            `flex-row justify-center items-center px-6 py-3.5 rounded-full`,
            selected.pickup && selected.dropoff
              ? `bg-base-green`
              : `bg-gray-300`
          )}
          disabled={!selected.pickup || !selected.dropoff}
        onPress={() => {
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
          } else {
            action();
          }
        }}
      >
          <Text style={tw.style(`text-white text-[16px] mr-2`, { fontFamily: "RobotoBold" })}>
            Continue
          </Text>
          <AntDesign name="right" size={20} color="white" />
      </TouchableOpacity>
      </View>
    </>
  );
};
