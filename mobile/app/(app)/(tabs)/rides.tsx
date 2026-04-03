import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, MaterialIcons, Entypo } from "@expo/vector-icons";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, memo } from "react";

import { AppContext } from "@/app/context";
import apiClient from "@/utils/apiClient";
import { router, useLocalSearchParams } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthState } from "@/store/AuthSlice";
import { useSelector, useDispatch } from "react-redux";
import { setRideData, setAppData } from "@/store/AppSlice";
import RidesInfoModal from "@/components/rides/RidesInfoModal";
import BookRideHowToModal from "@/components/rides/BookRideHowToModal";
import { DriverBookingSheet } from "@/components/driver/bookingSheet";
import type { BottomSheetMethods } from "@devvie/bottom-sheet";
import logger from "@/utils/logger";
import { ACTIVE_BOOKING } from "@/constants";
import { formatBookingDate, formatBookingTime } from "@/lib/formatBookingDateTime";
import { safeShowMessage } from "@/utils/safeShowMessage";
import { useFocusRefresh } from "@/hooks/useFocusRefresh";

type RideStatus = "pending" | "accepted" | "in_progress" | "completed" | "cancelled" | "scheduled" | "requested";

interface Ride {
  ride_id: string;
  pickup: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  destination: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  status: RideStatus;
  fare: number;
  created_at: string;
  completed_at?: string;
  cancelled_at?: string;
  scheduled_at?: string; // ISO date string for scheduled rides
  isScheduled?: boolean; // Flag to indicate if ride is scheduled
  vehicle_type?: {
    name: string;
  };
  driver?: {
    name: string;
    phone: string;
  };
  // Store raw data for rebooking
  _raw?: any; // Original API response data
}

interface GroupedRide {
  month: string;
  year: string;
  rides: Ride[];
}

// Empty State Component for Past Rides
const EmptyPastRides = memo(() => (
  <View style={tw`flex-1 justify-center items-center px-6 py-12`}>
    <View style={tw`mb-6`}>
      <View style={tw`bg-[#F5F5F5] rounded-full p-6 items-center justify-center`}>
        <MaterialIcons name="history" size={64} color={tw.color("base-green")} style={tw`opacity-40`} />
      </View>
    </View>
    <Text
      style={tw.style(`text-2xl text-[#242E42] text-center mb-3`, {
        fontFamily: "RobotoBold",
      })}
    >
      No Past Rides
    </Text>
    <Text
      style={tw.style(`text-base text-[#8E8E93] text-center leading-6 px-4`, {
        fontFamily: "RobotoRegular",
      })}
    >
      Your completed and cancelled rides will appear here.
    </Text>
  </View>
));

EmptyPastRides.displayName = "EmptyPastRides";

// Empty State Component for Upcoming Rides
const EmptyUpcomingRides = memo(({ onScheduleRide }: { onScheduleRide: () => void }) => {
  return (
    <View style={tw`flex-1 justify-center items-center px-6 py-12`}>
      <View style={tw`mb-6`}>
        <View style={tw`bg-[#F5F5F5] rounded-full p-6 items-center justify-center`}>
          <MaterialIcons name="schedule" size={64} color={tw.color("base-green")} style={tw`opacity-40`} />
        </View>
      </View>
      <Text
        style={tw.style(`text-2xl text-[#242E42] text-center mb-3`, {
          fontFamily: "RobotoBold",
        })}
      >
        No upcoming rides
      </Text>
      <Text
        style={tw.style(`text-base text-[#8E8E93] text-center leading-6 px-4 mb-6`, {
          fontFamily: "RobotoRegular",
        })}
      >
        Schedule rides in advance for school runs, work commutes, or airport pickups.
      </Text>
      <TouchableOpacity
        onPress={onScheduleRide}
        style={tw`bg-base-green py-4 px-8 rounded-full`}
      >
        <Text
          style={tw.style(`text-lg text-white`, {
            fontFamily: "RobotoBold",
          })}
        >
          Schedule a Ride
        </Text>
      </TouchableOpacity>
    </View>
  );
});

EmptyUpcomingRides.displayName = "EmptyUpcomingRides";

// Format price helper
const formatPrice = (price: number, isCancelled: boolean): string => {
  if (isCancelled) {
    return "₦0";
  }
  if (!price || price === 0) {
    return "₦0";
  }
  return `₦${Math.round(price).toLocaleString()}`;
};

// Remove Google Plus Codes from address (e.g., "83GJ+5GJ, " or "84FG+W92, ")
const removePlusCode = (address: string): string => {
  if (!address) return address;
  // Pattern matches: "XXXX+XXX, " at the start of the address
  return address.replace(/^[A-Z0-9]{2,4}\+[A-Z0-9]{2,4},\s*/i, '').trim();
};

// Remove postal codes from address (e.g., "Abakaliki 482101" -> "Abakaliki")
const removePostalCode = (address: string): string => {
  if (!address) return address;
  // Pattern matches: city name followed by 5-6 digit postal code
  // Examples: "Abakaliki 482101" -> "Abakaliki"
  return address.replace(/\b([A-Za-z\s]+)\s+\d{5,6}\b/g, '$1').trim();
};

// Format address like Google Maps - clean and meaningful
const formatGoogleMapsStyle = (placeName: string, address: string): string => {
  if (!placeName && !address) {
    return "Location not available";
  }

  // Clean the address
  let cleanedAddress = address || "";
  
  // Remove plus codes
  cleanedAddress = removePlusCode(cleanedAddress);
  
  // Remove postal codes (5-6 digit codes after city names)
  cleanedAddress = removePostalCode(cleanedAddress);
  
  // Remove duplicate commas and extra spaces
  cleanedAddress = cleanedAddress.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  
  // Split address into parts
  const addressParts = cleanedAddress.split(',').map(p => p.trim()).filter(p => p);
  
  // Filter out country and postal codes
  const filteredParts = addressParts.filter(part => {
    const lowerPart = part.toLowerCase();
    // Remove country (Nigeria/NG)
    if (lowerPart.match(/^(nigeria|ng)$/i)) return false;
    // Remove standalone postal codes
    if (part.match(/^\d{5,6}$/)) return false;
    return true;
  });
  
  // If we have a place name, always show it first, then append address parts
  if (placeName && placeName.trim()) {
    const cleanPlaceName = placeName.trim();
    
    // If we have address parts, check which ones aren't already in the place name
    if (filteredParts.length > 0) {
      const placeNameLower = cleanPlaceName.toLowerCase();
      
      // Filter out address parts that are already mentioned in the place name
      const uniqueAddressParts = filteredParts.filter(part => {
        const partLower = part.toLowerCase();
        // Skip if this part is already in the place name
        // But be lenient - only skip if it's an exact match or very similar
        if (placeNameLower.includes(partLower) && partLower.length > 5) {
          return false; // Skip this part as it's already in place name
        }
        return true;
      });
      
      // Format: "Place Name, Street/Area, City, State"
      // Example: "Presco Field, Ezza Road, Abakaliki, Ebonyi"
      // Example: "CAS Campus, Ebonyi State University, Azuiyi Udene, Abakaliki, Ebonyi"
      if (uniqueAddressParts.length > 0) {
        return `${cleanPlaceName}, ${uniqueAddressParts.join(', ')}`;
      } else {
        // All address parts are in place name, just show place name
        return cleanPlaceName;
      }
    } else {
      // No address parts, just show place name
      return cleanPlaceName;
    }
  }
  
  // No place name, just return cleaned address
  return filteredParts.join(', ') || "Location not available";
};

// Format location helper - clean address and truncate if needed
const formatLocation = (placeName: string, address: string, maxLength: number = 80): string => {
  const formatted = formatGoogleMapsStyle(placeName, address);
  
  // Truncate if too long, but try to preserve the place name
  if (formatted.length <= maxLength) {
    return formatted;
  }
  
  // If truncated, try to keep the place name (before first comma) if it exists
  const firstCommaIndex = formatted.indexOf(',');
  if (firstCommaIndex > 0 && firstCommaIndex < maxLength - 10) {
    // Keep place name and truncate the address part
    const placeNamePart = formatted.substring(0, firstCommaIndex);
    const remainingSpace = maxLength - placeNamePart.length - 4; // 4 for ", ..."
    const addressPart = formatted.substring(firstCommaIndex + 1);
    if (remainingSpace > 10 && addressPart.length > remainingSpace) {
      return `${placeNamePart}, ${addressPart.substring(0, remainingSpace - 3)}...`;
    }
  }
  
  return formatted.substring(0, maxLength - 3) + "...";
};

const inferRideStatus = (ride: any): RideStatus => {
  const rawStatus = String(ride?.status || ride?.ride_status || "").trim().toLowerCase();

  if (ride?.cancelled_at || ride?.cancelledAt || ride?.canceled_at || ride?.canceledAt) {
    return "cancelled";
  }

  if (ride?.completed_at || ride?.completedAt) {
    return "completed";
  }

  if (rawStatus === "cancelled" || rawStatus === "canceled") {
    return "cancelled";
  }

  if (rawStatus === "completed") {
    return "completed";
  }

  if (rawStatus === "in_progress" || rawStatus === "in progress" || ride?.is_started || ride?.is_ride_started) {
    return "in_progress";
  }

  if (rawStatus === "accepted") {
    return "accepted";
  }

  if (rawStatus === "pending") {
    return "pending";
  }

  if (rawStatus === "requested") {
    return "requested";
  }

  return "scheduled";
};

type BookingStage = "scheduled" | "searching" | "confirmed" | "ongoing";

const getBookingStage = (ride: Ride): BookingStage => {
  const status = String(ride.status || "").toLowerCase();
  if (status === "in_progress") return "ongoing";
  if (status === "accepted") return "confirmed";
  if (status === "pending" || status === "requested") return "searching";
  return "scheduled";
};

const getBookingStatusMeta = (ride: Ride, bookingTime?: string) => {
  const stage = getBookingStage(ride);

  switch (stage) {
    case "ongoing":
      return {
        stage,
        label: "On trip",
        hint: "Your ride is currently in progress",
        accent: "#2563EB",
        background: "#E8F0FF",
      };
    case "confirmed":
      return {
        stage,
        label: "Driver confirmed",
        hint: "A driver has accepted this booking",
        accent: "#2E7D52",
        background: "#E8F5E9",
      };
    case "searching":
      return {
        stage,
        label: "Finding driver",
        hint: "We are still matching you with a driver",
        accent: "#F59E0B",
        background: "#FFF6E5",
      };
    default:
      return {
        stage,
        label: "Scheduled",
        hint: bookingTime ? `Pickup planned for ${formatBookingTime(bookingTime)}` : "Pickup time has been reserved",
        accent: "#0F9D8A",
        background: "#E7F7F3",
      };
  }
};

// Ride List Item Component - Memoized and Optimized
const RideListItem = memo(({ item, onRebook, onRideDetails }: { item: Ride; onRebook: (ride: Ride) => void; onRideDetails?: (ride: Ride) => void }) => {
  const formatDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Date unknown";
      const day = date.getDate();
      const month = date.toLocaleDateString("en-US", { month: "short" });
      return `${day} ${month}`;
    } catch {
      return "Date unknown";
    }
  }, []);

  const formatTime = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleTimeString("en-US", { 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: false 
      });
    } catch {
      return "";
    }
  }, []);

  const handleRidePress = useCallback(() => {
    if (onRideDetails) {
      onRideDetails(item);
    } else {
      router.push({ pathname: "/(app)/ride-details", params: { rideId: item.ride_id } });
    }
  }, [item, onRideDetails]);

  // For scheduled rides, use scheduled_at; otherwise use completed/cancelled/created
  const displayDate = item.scheduled_at || item.completed_at || item.cancelled_at || item.created_at;
  const dateText = useMemo(() => {
    const date = formatDate(displayDate);
    if (item.status === "cancelled") {
      return `${date} · Cancelled`;
    }
    if (item.status === "scheduled" || item.scheduled_at) {
      const scheduledTime = formatTime(item.scheduled_at || displayDate);
      return scheduledTime ? `${date} · ${scheduledTime}` : `${date} · Scheduled`;
    }
    const time = formatTime(displayDate);
    return time ? `${date} · ${time}` : date;
  }, [displayDate, item.status, item.scheduled_at, formatDate, formatTime]);

  const location = useMemo(() => {
    const placeName = item.destination?.name || "";
    const address = item.destination?.address || "";
    
    // Format like Google Maps: "Place Name, Street, City, State" (no postal codes)
    return formatLocation(placeName, address);
  }, [item.destination]);

  const price = item.fare || 0;
  const isCancelled = item.status === "cancelled";
  const formattedPrice = formatPrice(price, isCancelled);

  return (
    <TouchableOpacity
      style={tw`flex-row items-start gap-x-3 py-4 px-1 border-b border-[#F0F0F0]`}
      onPress={handleRidePress}
      activeOpacity={0.7}
    >
      <View style={tw`pt-0.5`}>
        <View style={tw`w-5 h-5 items-center justify-center`}>
          <AntDesign name="car" size={18} color={isCancelled ? "#8E8E93" : "#3C8F7C"} />
        </View>
      </View>
      <View style={tw`flex-1 min-w-0`}>
        <Text
          style={tw.style(`text-sm text-[#8E8E93] mb-2`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {dateText}
        </Text>
        <Text
          numberOfLines={2}
          style={tw.style(`text-[15px] text-[#242E42] mb-3 leading-5`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {location}
        </Text>
        <View style={tw`flex-row items-center justify-between`}>
          <Text
            style={tw.style(
              `text-base`,
              isCancelled && `line-through text-[#8E8E93]`,
              !isCancelled && `text-[#242E42]`,
              {
                fontFamily: "RobotoBold",
              }
            )}
          >
            {formattedPrice}
          </Text>
          <TouchableOpacity
            style={tw`p-2 rounded-full bg-[#F5F5F5] active:bg-[#E5E5E5]`}
            onPress={(e) => {
              e.stopPropagation();
              onRebook(item);
            }}
            activeOpacity={0.7}
            accessibilityLabel="Rebook this ride"
          >
            <AntDesign name="reload" size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

RideListItem.displayName = "RideListItem";

// Booking List Item Component - For Bookings Tab
const BookingListItem = memo(({ item, onView }: { item: Ride; onView: (ride: Ride) => void }) => {
  // Parse scheduled_at to get date and time
  const scheduledAt = item.scheduled_at ? new Date(item.scheduled_at) : null;
  const bookingDate = scheduledAt && !isNaN(scheduledAt.getTime())
    ? scheduledAt.toISOString().split('T')[0]
    : undefined;
  const bookingTime = scheduledAt && !isNaN(scheduledAt.getTime())
    ? scheduledAt.toTimeString().split(' ')[0].substring(0, 5)
    : undefined;

  // Extract pickup location - prioritize address, then name, avoid "Current Location" strings
  const rawPickup = item.pickup?.address || item.pickup?.name || item._raw?.pickup?.address || item._raw?.pickup_location || '';
  const pickupLocation = rawPickup && !rawPickup.includes('Current Location') && !rawPickup.includes('accuracy')
    ? rawPickup
    : (item._raw?.pickup?.address || item._raw?.pickup_location || "Pickup location");
  
  // Extract dropoff location
  const rawDropoff = item.destination?.address || item.destination?.name || item._raw?.dropoff?.address || item._raw?.dropoff_location || '';
  const dropoffLocation = rawDropoff || "Drop-off location";
  const statusMeta = getBookingStatusMeta(item, bookingTime);

  return (
    <View style={tw`mb-3`}>
      <View
        style={tw.style(
          `flex-row items-start px-5 py-4 bg-white rounded-[10px]`,
          {
            elevation: 4,
          }
        )}
      >
        {/* Left side: Pins and dotted line */}
        <View style={tw`flex-col items-center mr-4`}>
          <Entypo name="location-pin" size={24} color="#F44336" />
          <View
            style={tw.style(
              `h-[40px] border-l-2 border-dashed border-[#C8C7CC]`
            )}
          />
          <Entypo name="location-pin" size={24} color="#4CAF50" />
        </View>

        {/* Right side: Content */}
        <View style={tw`flex-1 flex-col justify-between`}>
          {/* Origin section */}
          <View style={tw`mb-4`}>
            <View style={tw`flex-row items-center justify-between mb-1`}>
              <Text
                style={tw.style(`text-[18px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Origin
              </Text>
              <View style={tw`items-end`}>
                <Text
                  style={tw.style(`text-[12px] text-[#5A5A5A]`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {bookingDate && bookingTime
                    ? `${formatBookingDate(bookingDate)} ${formatBookingTime(bookingTime)}`
                    : "Select Date Select Time"}
                </Text>
                <View
                  style={[
                    tw`mt-1 px-2.5 py-1 rounded-full`,
                    { backgroundColor: statusMeta.background },
                  ]}
                >
                  <Text
                    style={{
                      color: statusMeta.accent,
                      fontSize: 11,
                      fontFamily: "RobotoBold",
                    }}
                  >
                    {statusMeta.label}
                  </Text>
                </View>
              </View>
            </View>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {pickupLocation}
            </Text>
          </View>

          {/* Destination section */}
          <View>
            <Text
              style={tw.style(`text-[18px] text-[#5A5A5A] mb-1`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Destination
            </Text>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {dropoffLocation}
            </Text>
          </View>
        </View>
      </View>

      {/* View details section */}
      <View
        style={tw.style(
          `bg-white px-5 pt-4 pb-3 -mt-2 rounded-b-[10px]`,
          {
            elevation: 6,
          }
        )}
      >
        <TouchableOpacity onPress={() => onView(item)}>
          <Text
            style={tw.style(`text-[14px] text-[#4A4A4A]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            View details
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

BookingListItem.displayName = "BookingListItem";

// Section Header Component - Memoized
const SectionHeader = memo(({ title }: { title: string }) => (
  <View style={tw`py-4 px-4 bg-white border-b border-[#F0F0F0]`}>
    <Text
      style={tw.style(`text-lg text-[#242E42]`, {
        fontFamily: "RobotoBold",
      })}
    >
      {title}
    </Text>
  </View>
));

SectionHeader.displayName = "SectionHeader";

// Transform ride data helper
const transformRide = (ride: any): Ride => {
  console.log("RAW RIDE:", JSON.stringify(ride, null, 2));

  const pickFirstValue = (...values: any[]) =>
    values.find((value) => value !== undefined && value !== null && value !== "");

  const toNumber = (...values: any[]) => {
    for (const value of values) {
      if (value === undefined || value === null || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  };

  const firstPositiveNumber = (...values: any[]) => {
    for (const value of values) {
      if (value === undefined || value === null || value === "") continue;
      const parsed = Number(
        typeof value === "object" && value !== null
          ? value.totalFare ?? value.amount ?? value.value ?? 0
          : value
      );
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 0;
  };

  // Helper to extract name and address separately
  const getLocationData = (location: any) => {
    if (!location) {
      return { name: "", address: "" };
    }

    if (typeof location === "string") {
      return { name: "", address: location };
    }
    
    // Backend now returns both name (place name) and address (full address)
    // Try multiple possible field names from different response formats
    let name = location.name || "";
    let address = location.address || "";
    
    // Handle case where name might be null/undefined from backend
    if (!name || name === "null" || name === "undefined") {
      name = "";
    }
    
    // If name and address are the same (old rides without separate name field)
    // Try to extract place name from the address
    if (name && address && name === address) {
      // Check if address contains a comma (might have place name, street, city)
      if (address.includes(',')) {
        const parts = address.split(',').map(p => p.trim());
        const firstPart = parts[0];
        
        // Check if first part looks like a place name
        const isPlaceName = firstPart.length < 60 && 
                           !firstPart.match(/^\d+/) && // Doesn't start with number
                           !firstPart.match(/^(road|rd|street|st|avenue|ave|drive|dr|lane|ln|way|boulevard|blvd|close|crescent|cres|abakaliki|lagos|abuja)/i) &&
                           !firstPart.match(/\d{5,6}$/); // Doesn't end with postal code
        
        if (isPlaceName && parts.length > 1) {
          // First part is likely the place name, rest is the address
          return {
            name: firstPart,
            address: parts.slice(1).join(', ')
          };
        }
      }
      
      // If we can't extract, set name to empty so we just show the address
      name = "";
    }
    
    // If we have both name and address and they're different, use them
    if (name && address && name !== address) {
      return { 
        name: name.trim(), 
        address: address.trim() 
      };
    }
    
    // If only name exists, check if it contains both place name and address
    if (name && !address && name.includes(',')) {
      const parts = name.split(',').map(p => p.trim());
      const placeName = parts[0];
      const fullAddress = parts.slice(1).join(', ');
      
      // Check if first part looks like a place name
      const isPlaceName = placeName.length < 50 && 
                         !placeName.match(/^\d+/) && // Doesn't start with number
                         !placeName.match(/\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|way|boulevard|blvd|close|crescent|cres)\b/i);
      
      if (isPlaceName && fullAddress) {
        return { name: placeName, address: fullAddress };
      }
    }
    
    // Fallback: use name as address if no separate address
    return { 
      name: name && !name.includes(',') ? name.trim() : "", 
      address: address || name || "" 
    };
  };

  // Backend returns origin/destination in API response
  const pickupLocation =
    pickFirstValue(ride.origin, ride.pickupLocation, ride.pickup, ride.pickup_location) || {};
  const dropoffLocation =
    pickFirstValue(
      ride.dropoff_location,
      ride.dropoffLocation,
      ride.destination,
      ride.dropoff,
      ride.destination_name
    ) || {};
  
  const pickupData = getLocationData(pickupLocation);
  const destinationData = getLocationData(dropoffLocation);
  const fare = firstPositiveNumber(
    ride.fare?.totalFare,
    ride.fare,
    ride.total_fare,
    ride.totalFare,
    ride.amount,
    ride.ride_fare,
    ride.price,
    ride.cost
  );
  const pickupLat = toNumber(
    ride.pickupLocation?.lat,
    ride.pickup?.lat,
    ride.pickup_location?.lat,
    ride.origin?.lat,
    ride.origin?.latitude,
    ride.origin?.location?.latitude,
    ride.origin?.location?.lat,
    ride.pickupLocation?.coordinates?.[1],
    ride.pickup?.coordinates?.[1],
    ride.origin?.coordinates?.[1]
  );
  const pickupLng = toNumber(
    ride.pickupLocation?.lng,
    ride.pickupLocation?.long,
    ride.pickup?.lng,
    ride.pickup?.long,
    ride.pickup_location?.lng,
    ride.pickup_location?.long,
    ride.origin?.lng,
    ride.origin?.long,
    ride.origin?.longitude,
    ride.origin?.location?.longitude,
    ride.origin?.location?.long,
    ride.origin?.location?.lng,
    ride.pickupLocation?.coordinates?.[0],
    ride.pickup?.coordinates?.[0],
    ride.origin?.coordinates?.[0]
  );
  const dropoffLat = toNumber(
    ride.dropoff_location?.lat,
    ride.dropoffLocation?.lat,
    ride.destination?.lat,
    ride.dropoff?.lat,
    ride.destination?.location?.latitude,
    ride.destination?.location?.lat,
    ride.dropoff?.location?.latitude,
    ride.dropoff?.location?.lat,
    ride.dropoff_lat,
    ride.destination_lat,
    ride.dropoffLocation?.coordinates?.[1],
    ride.destination?.coordinates?.[1],
    ride.dropoff?.coordinates?.[1]
  );
  const dropoffLng = toNumber(
    ride.dropoff_location?.lng,
    ride.dropoff_location?.long,
    ride.dropoffLocation?.lng,
    ride.dropoffLocation?.long,
    ride.destination?.lng,
    ride.destination?.long,
    ride.dropoff?.lng,
    ride.dropoff?.long,
    ride.destination?.location?.longitude,
    ride.destination?.location?.long,
    ride.destination?.location?.lng,
    ride.dropoff?.location?.longitude,
    ride.dropoff?.location?.long,
    ride.dropoff?.location?.lng,
    ride.dropoff_lng,
    ride.dropoff_long,
    ride.destination_lng,
    ride.destination_long,
    ride.dropoffLocation?.coordinates?.[0],
    ride.destination?.coordinates?.[0],
    ride.dropoff?.coordinates?.[0]
  );

  return {
    ride_id: ride.ride_id || ride._id || String(Math.random()),
    pickup: {
      name: pickupData.name,
      address: pickupData.address,
      lat: pickupLat,
      lng: pickupLng,
    },
    destination: {
      name: destinationData.name,
      address: destinationData.address,
      lat: dropoffLat,
      lng: dropoffLng,
    },
    status: inferRideStatus(ride),
    fare,
    created_at: ride.created_at || ride.createdAt || new Date().toISOString(),
    completed_at: ride.completed_at || ride.completedAt,
    cancelled_at: ride.cancelled_at || ride.cancelledAt,
    scheduled_at: ride.scheduled_at || ride.scheduledAt || undefined, // Include scheduled time
    vehicle_type: ride.vehicleType,
    driver: ride.driver,
    // Preserve scheduled flag for filtering
    isScheduled: ride.isScheduled || ride.is_scheduled || false,
    // Store raw data for rebooking
    _raw: ride, // Keep original API response for coordinate extraction
  };
};

const RidesScreen = () => {
  const insets = useSafeAreaInsets();
  const { token } = useSelector(AuthState);
  const { apiConfig } = useContext(AppContext);
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState<"past" | "upcoming">("past");
  const [pastRides, setPastRides] = useState<Ride[]>([]);
  const [upcomingRides, setUpcomingRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showBookRideHowToModal, setShowBookRideHowToModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Record<string, unknown>>({});
  const [viewLoading, setViewLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const bookingSheetRef = useRef<BottomSheetMethods>(null);
  const lastFetchRef = useRef<number>(0);

  const isFocused = useIsFocused();
  const refreshOnFocus = useFocusRefresh(60_000);
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  // Open on Bookings tab when navigating with ?tab=upcoming (e.g. "View all Bookings")
  useEffect(() => {
    if (tab === "upcoming") {
      setActiveTab("upcoming");
    }
  }, [tab]);

  const handleScheduleRide = useCallback(() => {
    dispatch(setAppData({ isBooking: true, requestOpenBookRide: true }));
    router.push({
      pathname: "/(app)/(tabs)/(home)/home",
      params: { openBookRide: "true" },
    });
  }, [dispatch]);

  const handleRebook = useCallback((ride: Ride) => {
    console.log("Ride data fields:", JSON.stringify(ride, null, 2));

    const raw = ride._raw || {};
    const dropoffName =
      ride.destination?.address ||
      ride.destination?.name ||
      raw.dropoff_location ||
      raw.dropoff?.address ||
      raw.dropoff?.name ||
      raw.dropoff?.location?.address ||
      raw.dropoff?.location?.name ||
      raw.destination?.address ||
      raw.destination?.name ||
      raw.destination_name ||
      raw.destination ||
      "";

    const parsedDropoffLat = Number(
      ride.destination?.lat ||
        raw.dropoffLocation?.lat ||
        raw.dropoff?.lat ||
        raw.dropoff_lat ||
        raw.destination?.lat ||
        raw.destination_lat ||
        raw.dropoffLocation?.coordinates?.[1] ||
        raw.dropoff?.coordinates?.[1] ||
        raw.destination?.coordinates?.[1] ||
        raw.dropoff?.location?.latitude ||
        raw.dropoff?.location?.lat ||
        0
    );
    const parsedDropoffLng = Number(
      ride.destination?.lng ||
        raw.dropoffLocation?.lng ||
        raw.dropoff?.lng ||
        raw.dropoff_lng ||
        raw.destination?.lng ||
        raw.destination_lng ||
        raw.dropoffLocation?.coordinates?.[0] ||
        raw.dropoff?.coordinates?.[0] ||
        raw.destination?.coordinates?.[0] ||
        raw.dropoff?.location?.longitude ||
        raw.dropoff?.location?.lng ||
        0
    );

    const hasValidDropoffCoords =
      Number.isFinite(parsedDropoffLat) &&
      Number.isFinite(parsedDropoffLng) &&
      parsedDropoffLat !== 0 &&
      parsedDropoffLng !== 0;

    if (!dropoffName || !dropoffName.trim()) {
      safeShowMessage({ type: "info", message: "Cannot rebook this ride" });
      return;
    }

    if (!hasValidDropoffCoords) {
      logger.warn("Rebooking with name-only dropoff fallback", {
        rideId: ride.ride_id,
        dropoffName,
        raw,
      });
    }

    router.replace({
      pathname: "/(app)/(tabs)/(home)/home",
      params: {
        rebook_dropoff_name: dropoffName.trim(),
        rebook_dropoff_lat: hasValidDropoffCoords ? String(parsedDropoffLat) : undefined,
        rebook_dropoff_lng: hasValidDropoffCoords ? String(parsedDropoffLng) : undefined,
      },
    });
  }, []);

  // Group rides by month and year - Memoized
  const groupedPastRides = useMemo(() => {
    if (pastRides.length === 0) return [];

    const grouped: { [key: string]: Ride[] } = {};

    pastRides.forEach((ride) => {
      try {
        const date = new Date(ride.completed_at || ride.cancelled_at || ride.created_at);
        if (isNaN(date.getTime())) return;
        
        const month = date.toLocaleDateString("en-US", { month: "long" });
        const year = date.getFullYear().toString();
        const key = `${month} ${year}`;

        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(ride);
      } catch (error) {
        console.warn("Error processing ride date:", error);
      }
    });

    // Convert to array and sort by date (newest first)
    return Object.entries(grouped)
      .map(([key, rides]) => {
        const [month, year] = key.split(" ");
        return {
          month,
          year,
          rides: rides.sort((a, b) => {
            try {
              const dateA = new Date(a.completed_at || a.cancelled_at || a.created_at).getTime();
              const dateB = new Date(b.completed_at || b.cancelled_at || b.created_at).getTime();
              return dateB - dateA;
            } catch {
              return 0;
            }
          }),
        };
      })
      .sort((a, b) => {
        try {
          const dateA = new Date(`${a.month} 1, ${a.year}`).getTime();
          const dateB = new Date(`${b.month} 1, ${b.year}`).getTime();
          return dateB - dateA;
        } catch {
          return 0;
        }
      });
  }, [pastRides]);

  // Fetch rides - Optimized to use single API call
  useEffect(() => {
    refreshOnFocus(() => {
      if (!token || !apiConfig) {
        if (!token) {
          setPastRides([]);
          setUpcomingRides([]);
        }
        return;
      }

      // Prevent duplicate fetches within 2 seconds
      const now = Date.now();
      if (now - lastFetchRef.current < 2000 && !loading) {
        return;
      }

      // Debounce to prevent rapid re-fetches
      const fetchTimer = setTimeout(() => {
        lastFetchRef.current = Date.now();
        setLoading(true);

        // Fetch both ride history and scheduled bookings
        Promise.all([
          apiClient.get("booking/history", { params: { limit: 200 } }),
          apiClient.get("schedule/latest/booking").catch(() => ({ data: { data: [] } })), // Don't fail if bookings endpoint fails
        ])
          .then(([ridesResponse, bookingsResponse]) => {
            const allRides = ridesResponse.data?.data?.rides || [];
            const bookings = bookingsResponse.data?.data || [];

            // Transform bookings to ride format
            const transformedBookings = Array.isArray(bookings)
              ? bookings.map((booking: any) => {
                  // Parse scheduled_at date
                  const scheduledAt = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
                  const bookingDate =
                    scheduledAt && !isNaN(scheduledAt.getTime())
                      ? scheduledAt.toISOString().split("T")[0]
                      : booking.booking_date || "";
                  const bookingTime =
                    scheduledAt && !isNaN(scheduledAt.getTime())
                      ? scheduledAt.toTimeString().split(" ")[0].substring(0, 5)
                      : booking.booking_time || "";

                  return {
                    ride_id: booking.ride_id || booking.booking_id || booking._id || "",
                    _id: booking._id || booking.ride_id || booking.booking_id || "",
                    status: inferRideStatus(booking),
                    isScheduled: true,
                    is_scheduled: true,
                    scheduledAt: booking.scheduled_at || booking.scheduled_at,
                    scheduled_at: booking.scheduled_at || booking.scheduled_at,
                    pickupLocation: {
                      address: booking.pickup?.address || booking.pickup_location || booking.origin || "",
                      coordinates: booking.pickup?.location
                        ? [booking.pickup.location.longitude || 0, booking.pickup.location.latitude || 0]
                        : [0, 0],
                    },
                    dropoffLocation: {
                      address: booking.dropoff?.address || booking.dropoff_location || booking.destination || "",
                      coordinates: booking.dropoff?.location
                        ? [booking.dropoff.location.longitude || 0, booking.dropoff.location.latitude || 0]
                        : [0, 0],
                    },
                    fare: booking.fare || booking.cost || 0,
                    vehicleType: booking.vehicle_type,
                    driver: booking.driver,
                    createdAt: booking.created_at || new Date().toISOString(),
                    ...booking, // Include all other fields
                  };
                })
              : [];

            // Merge bookings with rides (avoid duplicates by ride_id)
            const rideIds = new Set(allRides.map((r: any) => r.ride_id || r._id));
            const uniqueBookings = transformedBookings.filter((b: any) => !rideIds.has(b.ride_id || b._id));
            const combinedRides = [...allRides, ...uniqueBookings];

            if (__DEV__) {
              console.log("📋 Total rides fetched:", allRides.length);
              console.log("📅 Scheduled bookings fetched:", bookings.length);
              console.log("📋 Combined rides:", combinedRides.length);
            }

            // Filter past rides (completed and cancelled)
            const past = combinedRides
              .filter((ride: any) => {
                const status = (ride.status || "").toLowerCase();
                return ["completed", "cancelled"].includes(status);
              })
              .map(transformRide);

            // Filter bookings/upcoming rides (pending, accepted, in_progress, scheduled)
            // Also include scheduled rides that haven't been completed/cancelled
            const upcoming = combinedRides
              .filter((ride: any) => {
                const status = (ride.status || "").toLowerCase();
                // Check for scheduled flag in both camelCase and snake_case
                const isScheduled = ride.isScheduled || ride.is_scheduled || false;
                const scheduledAt = ride.scheduledAt || ride.scheduled_at;

                // Include active rides (but exclude if they're completed/cancelled)
                if (["pending", "accepted", "in_progress"].includes(status)) {
                  // If it's a scheduled ride, check if scheduled time is in the future
                  if (isScheduled && scheduledAt) {
                    const scheduledDate = new Date(scheduledAt);
                    const now = new Date();
                    return scheduledDate > now;
                  }
                  return true;
                }

                // Include scheduled rides (status might be "scheduled" or "requested" with isScheduled flag)
                if (isScheduled && scheduledAt) {
                  const scheduledDate = new Date(scheduledAt);
                  const now = new Date();
                  // Only include if scheduled time is in the future
                  if (scheduledDate > now) {
                    if (__DEV__) {
                      console.log("✅ Including scheduled ride:", {
                        id: ride.ride_id || ride._id,
                        scheduledAt: scheduledAt,
                        scheduledDate: scheduledDate.toISOString(),
                        now: now.toISOString(),
                      });
                    }
                    return true;
                  }
                }

                // Include rides with status "scheduled" even if flag is missing
                if (status === "scheduled" && scheduledAt) {
                  const scheduledDate = new Date(scheduledAt);
                  const now = new Date();
                  const isFuture = scheduledDate > now;
                  if (__DEV__ && isFuture) {
                    console.log('✅ Including ride with status "scheduled":', {
                      id: ride.ride_id || ride._id,
                      scheduledAt: scheduledAt,
                    });
                  }
                  return isFuture;
                }

                return false;
              })
              .map(transformRide);

            if (__DEV__) {
              console.log("📊 Bookings count:", upcoming.length);
              console.log("📊 Past rides count:", past.length);
            }

            setPastRides(past);
            setUpcomingRides(upcoming);
          })
          .catch((err) => {
            const errorData = err?.response?.data || {};
            const errorMessage = errorData.message || err?.message || "Failed to fetch rides";

            // Handle rate limit errors gracefully
            if (errorMessage.includes("Too many requests") || err?.response?.status === 429) {
              showMessage({
                type: "warning",
                message: "Too many requests. Please wait a moment and try again.",
                duration: 4000,
              });
              // Don't clear existing data on rate limit - keep what we have
              return;
            }

            // Only show error for other failures
            if (err?.response?.status !== 401) {
              console.error("Error fetching rides:", errorMessage);
              // Only clear data if it's a real error (not rate limit)
              setPastRides([]);
              setUpcomingRides([]);
            }
          })
          .finally(() => setLoading(false));
      }, 300); // 300ms debounce

      return () => clearTimeout(fetchTimer);
    });
  }, [isFocused, refreshOnFocus, token, apiConfig]);

  // Explicit refreshes (cancel booking, etc.) should bypass focus staleness guard.
  useEffect(() => {
    if (!isFocused) return;
    if (!token || !apiConfig) return;
    if (refreshTrigger === 0) return;
    lastFetchRef.current = 0;
    setLoading(true);
    Promise.all([
      apiClient.get("booking/history", { params: { limit: 200 } }),
      apiClient.get("schedule/latest/booking").catch(() => ({ data: { data: [] } })),
    ])
      .then(([ridesResponse, bookingsResponse]) => {
        const allRides = ridesResponse.data?.data?.rides || [];
        const bookings = bookingsResponse.data?.data || [];
        const transformedBookings = Array.isArray(bookings)
          ? bookings.map((booking: any) => ({
              ride_id: booking.ride_id || booking.booking_id || booking._id || "",
              _id: booking._id || booking.ride_id || booking.booking_id || "",
              status: inferRideStatus(booking),
              isScheduled: true,
              is_scheduled: true,
              scheduledAt: booking.scheduled_at || booking.scheduled_at,
              scheduled_at: booking.scheduled_at || booking.scheduled_at,
              pickupLocation: {
                address: booking.pickup?.address || booking.pickup_location || booking.origin || "",
                coordinates: booking.pickup?.location
                  ? [booking.pickup.location.longitude || 0, booking.pickup.location.latitude || 0]
                  : [0, 0],
              },
              dropoffLocation: {
                address: booking.dropoff?.address || booking.dropoff_location || booking.destination || "",
                coordinates: booking.dropoff?.location
                  ? [booking.dropoff.location.longitude || 0, booking.dropoff.location.latitude || 0]
                  : [0, 0],
              },
              fare: booking.fare || booking.cost || 0,
              vehicleType: booking.vehicle_type,
              driver: booking.driver,
              createdAt: booking.created_at || new Date().toISOString(),
              ...booking,
            }))
          : [];
        const rideIds = new Set(allRides.map((r: any) => r.ride_id || r._id));
        const uniqueBookings = transformedBookings.filter((b: any) => !rideIds.has(b.ride_id || b._id));
        const combinedRides = [...allRides, ...uniqueBookings];
        const past = combinedRides
          .filter((ride: any) => ["completed", "cancelled"].includes(String(ride.status || "").toLowerCase()))
          .map(transformRide);
        const upcoming = combinedRides
          .filter((ride: any) => {
            const status = String(ride.status || "").toLowerCase();
            const isScheduled = ride.isScheduled || ride.is_scheduled || false;
            const scheduledAt = ride.scheduledAt || ride.scheduled_at;
            if (["pending", "accepted", "in_progress"].includes(status)) {
              if (isScheduled && scheduledAt) return new Date(scheduledAt) > new Date();
              return true;
            }
            if (isScheduled && scheduledAt) return new Date(scheduledAt) > new Date();
            if (status === "scheduled" && scheduledAt) return new Date(scheduledAt) > new Date();
            return false;
          })
          .map(transformRide);
        setPastRides(past);
        setUpcomingRides(upcoming);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshTrigger, isFocused, token, apiConfig]);

  const handleTabChange = useCallback((tab: "past" | "upcoming") => {
    setActiveTab(tab);
  }, []);

  const handleInfoPress = useCallback(() => {
    setShowInfoModal(true);
  }, []);

  const handleCloseInfoModal = useCallback(() => {
    setShowInfoModal(false);
  }, []);

  const handleOpenBookRideHowTo = useCallback(() => {
    setShowBookRideHowToModal(true);
  }, []);
  const handleCloseBookRideHowTo = useCallback(() => {
    setShowBookRideHowToModal(false);
  }, []);

  const renderPastRides = useCallback(() => {
    if (loading) {
      return (
        <View style={tw`flex-1 justify-center items-center py-20`}>
          <ActivityIndicator color={tw.color("base-green")} size="large" />
        </View>
      );
    }

    if (pastRides.length === 0) {
      return <EmptyPastRides />;
    }

    return (
      <FlatList
        data={groupedPastRides}
        keyExtractor={(item) => `${item.month}-${item.year}`}
        contentContainerStyle={tw`pb-20`}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={5}
        showsVerticalScrollIndicator={true}
        renderItem={({ item: group }) => (
          <View>
            <SectionHeader title={`${group.month} ${group.year}`} />
            <View style={tw`px-4 bg-white`}>
              {group.rides.map((ride) => (
                <RideListItem key={ride.ride_id} item={ride} onRebook={handleRebook} />
              ))}
            </View>
          </View>
        )}
      />
    );
  }, [loading, pastRides.length, groupedPastRides]);

  const handleViewBooking = useCallback((ride: Ride) => {
    const bookingId = ride.ride_id || ride._raw?.ride_id || ride._raw?._id;
    if (!bookingId) {
      showMessage({ type: "warning", message: "Booking details not available" });
      return;
    }
    const raw = ride._raw || {};
    const scheduledAt = ride.scheduled_at ? new Date(ride.scheduled_at) : null;
    const bookingDate = scheduledAt && !isNaN(scheduledAt.getTime())
      ? scheduledAt.toISOString().split("T")[0]
      : raw.booking_date || "";
    const bookingTime = scheduledAt && !isNaN(scheduledAt.getTime())
      ? scheduledAt.toTimeString().split(" ")[0].substring(0, 5)
      : raw.booking_time || "";
    const fare = typeof ride.fare === "number" ? ride.fare : (raw.fare ?? raw.cost ?? 0);
    const mapped: Record<string, unknown> = {
      booking_id: bookingId,
      ride_id: bookingId,
      pickup_location: ride.pickup?.address || ride.pickup?.name || raw.pickup_location || "",
      dropoff_location: ride.destination?.address || ride.destination?.name || raw.dropoff_location || "",
      booking_date: bookingDate,
      booking_time: bookingTime,
      scheduled_at: ride.scheduled_at || raw.scheduled_at,
      fare,
      cost: fare,
      status: ride.status || raw.status || "scheduled",
      payment_method: raw.payment_method || raw.payment_type || "cash",
      is_started: raw.is_started ?? raw.is_ride_started ?? false,
      username: raw.username || raw.passenger?.name || "Passenger",
      driver_id: raw.driver_id ?? null,
      driver_name: raw.driver_name ?? raw.driver?.name ?? null,
      driver_phone: raw.driver_phone ?? raw.driver?.phone ?? null,
      vehicle_type: raw.vehicle_type?.name ?? raw.vehicle_type ?? null,
    };
    setSelectedBooking(mapped);
    setViewLoading(false);
    bookingSheetRef.current?.open();
  }, []);

  const cancelBooking = useCallback((booking_id: string, setLoadingState: React.Dispatch<React.SetStateAction<boolean>>) => {
    const currentStatus = String(selectedBooking?.status ?? "").toLowerCase();
    if (currentStatus === "in_progress" || currentStatus === "in progress" || currentStatus === "started") {
      safeShowMessage({
        type: "warning",
        message: "This ride has already started and cannot be cancelled.",
      });
      return;
    }

    setLoadingState(true);
    apiClient
      .post("schedule/cancel/booking", { booking_id })
      .then(() => {
        bookingSheetRef.current?.close();
        setSelectedBooking({});
        lastFetchRef.current = 0;
        setRefreshTrigger((t) => t + 1);
      })
      .catch((err: any) => {
        showMessage({
          type: "danger",
          message: err?.response?.data?.message || err?.response?.data?.error || "Failed to cancel booking",
        });
      })
      .finally(() => setLoadingState(false));
  }, [selectedBooking?.status]);

  const renderUpcomingRides = useCallback(() => {
    if (loading) {
      return (
        <View style={tw`flex-1 justify-center items-center py-20`}>
          <ActivityIndicator color={tw.color("base-green")} size="large" />
        </View>
      );
    }

    if (upcomingRides.length === 0) {
      return <EmptyUpcomingRides onScheduleRide={handleScheduleRide} />;
    }

    return (
      <FlatList
        data={upcomingRides}
        keyExtractor={(item) => item.ride_id || `booking-${item._raw?._id || Math.random()}`}
        contentContainerStyle={tw`pb-36 px-4 pt-4`}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={5}
        showsVerticalScrollIndicator={true}
        renderItem={({ item }) => <BookingListItem item={item} onView={handleViewBooking} />}
      />
    );
  }, [loading, upcomingRides, handleViewBooking, handleScheduleRide]);

  const topInset = Math.max(insets.top, StatusBar.currentHeight ?? 0, 44);
  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
        paddingTop: topInset + 12,
      })}
      source={require("@images/pattern-bg.png")}
    >
      {/* Header */}
      <View style={tw`flex-row items-center justify-between px-6 py-4 bg-white`}>
        <Text
          style={tw.style(`text-2xl text-[#2A2A2A]`, {
            fontFamily: "RobotoBold",
          })}
        >
          Rides
        </Text>
        <TouchableOpacity onPress={handleInfoPress} activeOpacity={0.7}>
          <View style={tw`w-8 h-8 rounded-full bg-[#F5F5F5] items-center justify-center`}>
            <Text style={tw.style(`text-base text-[#242E42]`, { fontFamily: "RobotoBold" })}>
              i
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={tw`flex-row px-6 border-b border-[#EFEFEF] bg-white`}>
        <TouchableOpacity
          onPress={() => handleTabChange("past")}
          style={tw`flex-1 pb-3 border-b-2 ${
            activeTab === "past" ? "border-base-green" : "border-transparent"
          }`}
          activeOpacity={0.7}
        >
          <Text
            style={tw.style(
              `text-base text-center`,
              activeTab === "past" ? "text-[#242E42]" : "text-[#8E8E93]",
              {
                fontFamily: activeTab === "past" ? "RobotoBold" : "RobotoRegular",
              }
            )}
          >
            Past
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleTabChange("upcoming")}
          style={tw`flex-1 pb-3 border-b-2 ${
            activeTab === "upcoming" ? "border-base-green" : "border-transparent"
          }`}
          activeOpacity={0.7}
        >
          <Text
            style={tw.style(
              `text-base text-center`,
              activeTab === "upcoming" ? "text-[#242E42]" : "text-[#8E8E93]",
              {
                fontFamily: activeTab === "upcoming" ? "RobotoBold" : "RobotoRegular",
              }
            )}
          >
            Bookings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={tw`flex-1 bg-white`}>
        {activeTab === "past" ? renderPastRides() : renderUpcomingRides()}
      </View>

      {activeTab === "upcoming" && upcomingRides.length > 0 ? (
        <View
          style={tw.style(`bg-white px-4 pt-3`, {
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: "#EFEFEF",
          })}
        >
          <TouchableOpacity
            onPress={handleScheduleRide}
            activeOpacity={0.85}
            style={tw`bg-base-green rounded-full py-4 items-center justify-center`}
          >
            <Text
              style={tw.style(`text-lg text-white`, {
                fontFamily: "RobotoBold",
              })}
            >
              Schedule a Ride
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Booking detail bottom sheet (same as former booked-rides screen) */}
      <DriverBookingSheet
        bottomSheetRef={bookingSheetRef}
        data={selectedBooking as any}
        isloading={viewLoading}
        cancel={
          String(selectedBooking?.status ?? "").toLowerCase() !== "cancelled"
            ? cancelBooking
            : undefined
        }
        viewBooking={() => {}}
        accepted={
          !!selectedBooking?.driver_id ||
          ["accepted", "in_progress", "completed", "cancelled"].includes(
            String(selectedBooking?.status ?? "").toLowerCase()
          )
        }
      />
      {/* Info Modal */}
      <RidesInfoModal
        visible={showInfoModal}
        onClose={handleCloseInfoModal}
      />
      <BookRideHowToModal
        visible={showBookRideHowToModal}
        onClose={handleCloseBookRideHowTo}
      />
    </ImageBackground>
  );
};

export default RidesScreen;
