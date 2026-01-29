import {
  Animated,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { AntDesign, Entypo, Ionicons } from "@expo/vector-icons";
import { Defs, Line, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import { useEffect, useRef, useMemo, useState } from "react";

import { TRide } from "@/types";
import tw from "@/lib/tailwind";
import { showMessage } from "react-native-flash-message";

interface Props {
  action: () => void;
  info: (driver_id: string) => void;
  cancel: () => void;
  chat: () => void;
  ride: {} | TRide;
}

export const WaitingView = ({ action, info, cancel, ride, chat }: Props) => {
  const data = ride as TRide;
  
  // Debug logging
  if (__DEV__) {
    console.log('🔍 WaitingView - ride data:', JSON.stringify(data, null, 2));
    console.log('🔍 WaitingView - data keys:', data ? Object.keys(data) : 'no data');
  }
  
  // Ensure we have at least an object
  if (!data || typeof data !== 'object') {
    console.warn('⚠️ WaitingView: Invalid ride data, using empty object');
  }
  
  const hasRideStarted = data?.is_ride_started || data?.isRideStarted || false;
  const hasDriver = data?.driver && typeof data.driver === 'object'
    ? Object.keys(data.driver).length > 0
    : false;
  const isAccepted = data?.accepted_by_driver || data?.acceptedByDriver || false;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [statusText, setStatusText] = useState<string>("Waiting for driver to accept");
  const [statusSubtext, setStatusSubtext] = useState<string>("Searching for nearby drivers...");

  useEffect(() => {
    if (!isAccepted && !hasRideStarted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isAccepted, hasRideStarted]);

  // Update status text only when values actually change
  useEffect(() => {
    let newStatusText: string;
    if (hasRideStarted) {
      newStatusText = "In Transit";
    } else if (isAccepted) {
      const time = formatTime(data?.arrival_time);
      if (time === "0 min" || time === "0") {
        newStatusText = "Arriving now";
      } else {
        newStatusText = `Arriving in ${time}`;
      }
    } else {
      newStatusText = "Waiting for driver to accept";
    }
    
    // Only update state if the value actually changed
    setStatusText(prev => prev !== newStatusText ? newStatusText : prev);
  }, [hasRideStarted, isAccepted, data?.arrival_time]);

  // Update status subtext only when values actually change
  useEffect(() => {
    let newStatusSubtext: string;
    if (hasRideStarted) {
      newStatusSubtext = "Your ride is in progress";
    } else if (isAccepted) {
      const distance = data?.arrival_distance 
        ? formatDistance(data.arrival_distance)
        : (data?.distance ? `${data.distance.toFixed(1)} km` : "0 km");
      if (distance === "0 km" || distance === "0") {
        newStatusSubtext = "Driver is here";
      } else {
        newStatusSubtext = `${distance} away`;
      }
    } else {
      newStatusSubtext = "Searching for nearby drivers...";
    }
    
    // Only update state if the value actually changed
    setStatusSubtext(prev => prev !== newStatusSubtext ? newStatusSubtext : prev);
  }, [hasRideStarted, isAccepted, data?.arrival_distance, data?.distance]);

  const formatCost = (cost: number | string | undefined) => {
    // Try multiple sources for cost
    let costValue = cost;
    if (!costValue && data) {
      costValue = (data as any)?.fare?.totalFare || 
                  (data as any)?.fare?.total_fare || 
                  data?.cost ||
                  (data as any)?.totalFare;
    }
    
    if (!costValue) return "₦0";
    const num = typeof costValue === "string" ? parseFloat(costValue) : costValue;
    if (isNaN(num) || num === 0) return "₦0";
    
    // Backend returns fare in USD, convert to Naira (approximate rate: 1500 NGN = 1 USD)
    // Values between 1-100 are typically USD, convert them
    const USD_TO_NGN = 1500;
    const finalAmount = (num >= 1 && num <= 100) ? Math.round(num * USD_TO_NGN) : Math.round(num);
    return `₦${finalAmount.toLocaleString()}`;
  };

  const formatDistance = (distance: string | number | undefined) => {
    if (!distance) return "0 km";
    // If it's a number (meters), convert to km
    if (typeof distance === "number") {
      if (distance >= 1000) {
        return `${(distance / 1000).toFixed(1)} km`;
      }
      return `${Math.round(distance)} m`;
    }
    // If it's already a string, check if it needs formatting
    const str = String(distance).trim();
    if (str === "0" || str === "" || str === "0 km" || str === "0 m") return "0 km";
    // If it contains "km" or "m", return as is
    if (str.includes("km") || str.includes("m")) return str;
    // Try to parse as number
    const num = parseFloat(str);
    if (!isNaN(num)) {
      if (num >= 1000) {
        return `${(num / 1000).toFixed(1)} km`;
      }
      return `${Math.round(num)} m`;
    }
    return str;
  };

  const formatTime = (time: string | number | undefined) => {
    if (!time) return "0 min";
    // If it's a number (minutes), format it
    if (typeof time === "number") {
      if (time === 0) return "0 min";
      if (time < 1) return "< 1 min";
      return `${Math.round(time)} min`;
    }
    // If it's already a string, check if it needs formatting
    const str = String(time).trim();
    if (str === "0" || str === "" || str === "0 min") return "0 min";
    // If it contains "min", return as is
    if (str.includes("min")) return str;
    // Try to parse as number
    const num = parseFloat(str);
    if (!isNaN(num)) {
      if (num === 0) return "0 min";
      if (num < 1) return "< 1 min";
      return `${Math.round(num)} min`;
    }
    return str;
  };


  // Always render something, even if data is missing
  return (
    <View style={styles.wrapper}>
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        bounces={false}
      >
      {/* Status Header - Always show */}
      <View style={styles.statusHeader}>
        {!isAccepted && !hasRideStarted && (
          <Animated.View style={[styles.loadingContainer, { transform: [{ scale: pulseAnim }] }]}>
            <ActivityIndicator size="large" color={tw.color("base-green") || "#3C8F7C"} />
          </Animated.View>
        )}
        {isAccepted && (
          <View style={styles.checkIconContainer}>
            <AntDesign name="check-circle" size={36} color={tw.color("base-green") || "#3C8F7C"} />
          </View>
        )}
        <Text style={styles.statusTitle}>{statusText}</Text>
        <Text style={styles.statusSubtext}>{statusSubtext}</Text>
      </View>

      {/* Driver Card - Only show when driver is assigned */}
      {hasDriver && isAccepted && (
        <TouchableOpacity
          onPress={() => info(data?.driver?.driver_id)}
          style={styles.driverCard}
          activeOpacity={0.8}
        >
          <View style={styles.driverInfo}>
            <View style={styles.avatarContainer}>
              {(data?.driver?.driver_image || 
                data?.driver?.image || 
                (data?.driver as any)?.user?.profileImage || 
                (data?.driver as any)?.user?.image) ? (
                <Image
                  source={{ 
                    uri: data.driver.driver_image || 
                          data.driver.image || 
                          (data.driver as any)?.user?.profileImage || 
                          (data.driver as any)?.user?.image 
                  }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <AntDesign name="user" size={28} color="#999" />
                </View>
              )}
            </View>
            <View style={styles.driverDetails}>
              <Text style={styles.driverName}>
                {data?.driver?.driver_name || 
                 data?.driver?.name || 
                 (data?.driver as any)?.user?.name ||
                 (data?.driver as any)?.user?.fullName ||
                 "Driver"}
              </Text>
              <View style={styles.driverMeta}>
                <View style={styles.ratingRow}>
                  <AntDesign name="star" size={12} color="#FBC02D" filled />
                  <Text style={styles.ratingText}>
                    {(() => {
                      const driver = data?.driver as any;
                      // Try multiple rating sources
                      if (driver?.driver_rating && driver.driver_rating > 0) {
                        return typeof driver.driver_rating === 'number' 
                          ? driver.driver_rating.toFixed(1) 
                          : parseFloat(String(driver.driver_rating)).toFixed(1);
                      }
                      if (driver?.rating?.average && driver.rating.average > 0) {
                        return typeof driver.rating.average === 'number'
                          ? driver.rating.average.toFixed(1)
                          : parseFloat(String(driver.rating.average)).toFixed(1);
                      }
                      if (driver?.rating && typeof driver.rating === 'number' && driver.rating > 0) {
                        return driver.rating.toFixed(1);
                      }
                      if (driver?.user?.rating && driver.user.rating > 0) {
                        return typeof driver.user.rating === 'number'
                          ? driver.user.rating.toFixed(1)
                          : parseFloat(String(driver.user.rating)).toFixed(1);
                      }
                      return "4.5"; // Default rating
                    })()}
                  </Text>
                  <Text style={styles.reviewCount}>
                    {(() => {
                      const driver = data?.driver as any;
                      if (driver?.driver_review_count && driver.driver_review_count > 0) {
                        return `(${driver.driver_review_count} ${driver.driver_review_count === 1 ? 'review' : 'reviews'})`;
                      }
                      if (driver?.rating?.count && driver.rating.count > 0) {
                        return `(${driver.rating.count} ${driver.rating.count === 1 ? 'review' : 'reviews'})`;
                      }
                      return '(New driver)';
                    })()}
                  </Text>
                </View>
                {/* Show distance/time - use trip data if arrival data is null */}
                {(() => {
                  const distance = data?.arrival_distance 
                    ? formatDistance(data.arrival_distance)
                    : (data?.distance ? `${data.distance.toFixed(1)} km` : null);
                  const time = data?.arrival_time 
                    ? formatTime(data.arrival_time)
                    : (data?.duration ? `${Math.round(data.duration)} min` : null);
                  
                  // Only show if we have valid distance/time and driver is not here
                  if (distance && time && distance !== "0 km" && time !== "0 min") {
                    return (
                      <View style={styles.distanceRow}>
                        <Entypo name="location-pin" size={11} color="#666" />
                        <Text style={styles.distanceText}>
                          {distance} • {time}
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
            </View>
          </View>
          {(data?.driver?.vehicle_image || (data?.driver as any)?.vehicleImages?.[0]?.url) && (
            <Image
              source={{ 
                uri: data.driver.vehicle_image || 
                      (data.driver as any)?.vehicleImages?.[0]?.url 
              }}
              style={styles.vehicleImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      )}

      {/* Trip Details Card - Always show */}
      <View style={styles.tripCard}>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Estimated Fare</Text>
          <Text style={styles.costValue}>
            {formatCost(data?.cost)}
          </Text>
        </View>
        
        {(data?.vehicle_type || data?.vehicleType?.name || data?.vehicleType?.displayName || (data as any)?.vehicleType) && (
          <View style={styles.vehicleTypeRow}>
            <Ionicons name="car-outline" size={15} color="#666" />
            <Text style={styles.vehicleTypeText}>
              {data?.vehicle_type || 
               data?.vehicleType?.displayName || 
               data?.vehicleType?.name || 
               (data as any)?.vehicleType ||
               "Vehicle"}
            </Text>
          </View>
        )}
      </View>

      {/* Progress Bar - Only show when ride started */}
      {hasRideStarted && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Svg width={"100%"} height={5} viewBox="0 0 310 5" fill="none">
              <Line
                x1={2.12}
                y1={2.88}
                x2={307.88}
                y2={2.87997}
                stroke="url(#paint0_linear_538_5518)"
                strokeWidth={4.24}
                strokeLinecap="round"
              />
              <Defs>
                <LinearGradient
                  id="paint0_linear_538_5518"
                  x1={310}
                  y1={5}
                  x2={1.49999}
                  y2={5}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop stopColor="#3C8F7C" />
                  <Stop offset={1} stopOpacity={0.2} />
                </LinearGradient>
              </Defs>
            </Svg>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {/* Chat and Call buttons - show when driver is accepted */}
        {isAccepted && hasDriver && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              onPress={() => {
                if (chat) {
                  // Check if we have driver user_id for chat
                  const driver = data?.driver as any;
                  const driverUserId = 
                    driver?.user_id || 
                    driver?.user?._id || 
                    driver?.user?.id ||
                    data?.driver_id; // Fallback to driver_id if user_id not available
                  
                  if (driverUserId) {
                    chat();
                  } else {
                    showMessage({
                      type: "warning",
                      message: "Driver information not available yet. Please wait...",
                    });
                  }
                } else {
                  showMessage({
                    type: "warning",
                    message: "Chat is not available at this time",
                  });
                }
              }}
              style={styles.quickActionButton}
              activeOpacity={0.8}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={22}
                color={tw.color("base-green") || "#3C8F7C"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                // Try multiple phone number sources from driver data
                const driver = data?.driver as any;
                const phoneNumber = 
                  driver?.driver_phone || 
                  driver?.phone || 
                  driver?.phone_number ||
                  driver?.user?.phone ||
                  driver?.user?.phoneNumber;
                
                if (phoneNumber) {
                  const phone = String(phoneNumber).trim();
                  // Format phone number properly for tel: URL
                  let formattedPhone = phone;
                  if (phone.startsWith("0")) {
                    formattedPhone = phone;
                  } else if (phone.startsWith("+")) {
                    formattedPhone = phone;
                  } else {
                    // Assume it's a local number without country code
                    formattedPhone = phone;
                  }
                  
                  Linking.openURL(`tel:${formattedPhone}`).catch((err) => {
                    console.error('Error opening phone dialer:', err);
                    showMessage({
                      type: "danger",
                      message: "Unable to make call. Please try again.",
                    });
                  });
                } else {
                  // If phone not in driver object, try to get from ride data
                  const fallbackPhone = (data as any)?.driver_phone || (data as any)?.phone;
                  if (fallbackPhone) {
                    Linking.openURL(`tel:${fallbackPhone}`).catch((err) => {
                      console.error('Error opening phone dialer:', err);
                      showMessage({
                        type: "danger",
                        message: "Unable to make call. Please try again.",
                      });
                    });
                  } else {
                    showMessage({
                      type: "warning",
                      message: "Driver phone number not available",
                    });
                  }
                }
              }}
              style={styles.quickActionButton}
              activeOpacity={0.8}
            >
              <Ionicons
                name="call-outline"
                size={22}
                color={tw.color("base-green") || "#3C8F7C"}
              />
            </TouchableOpacity>
          </View>
        )}

        {!isAccepted && (
          <TouchableOpacity
            onPress={action}
            style={styles.primaryButton}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={18} color="white" style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Request New Driver</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={cancel}
          style={styles.cancelButton}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>Cancel Ride</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#fff',
  },
  scrollContainer: {
    width: '100%',
  },
  container: {
    padding: 10,
    paddingTop: 4,
    paddingBottom: 10,
    width: '100%',
  },
  statusHeader: {
    alignItems: "center",
    marginBottom: 8,
  },
  loadingContainer: {
    marginBottom: 4,
  },
  checkIconContainer: {
    marginBottom: 2,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    marginBottom: 2,
    textAlign: "center",
  },
  statusSubtext: {
    fontSize: 11,
    color: "#666",
    fontFamily: "RobotoRegular",
    textAlign: "center",
  },
  driverCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  driverInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    marginBottom: 3,
  },
  driverMeta: {
    gap: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: "#1A1A1A",
    fontFamily: "RobotoMedium",
    marginLeft: 2,
  },
  reviewCount: {
    fontSize: 11,
    color: "#999",
    fontFamily: "RobotoRegular",
    marginLeft: 3,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distanceText: {
    fontSize: 11,
    color: "#666",
    fontFamily: "RobotoRegular",
  },
  vehicleImage: {
    width: 56,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#F9F9F9",
    marginLeft: 6,
  },
  tripCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  costLabel: {
    fontSize: 12,
    color: "#666",
    fontFamily: "RobotoRegular",
  },
  costValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    fontFamily: "RobotoBold",
    letterSpacing: 0.3,
  },
  vehicleTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  vehicleTypeText: {
    fontSize: 13,
    color: "#666",
    fontFamily: "RobotoMedium",
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressBar: {
    height: 4,
    width: "100%",
  },
  actionButtons: {
    gap: 8,
    marginTop: 6,
    marginBottom: 0,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 6,
  },
  quickActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: tw.color("base-green") || "#3C8F7C",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F9F4",
  },
  primaryButton: {
    backgroundColor: tw.color("base-green") || "#3C8F7C",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: tw.color("base-green") || "#3C8F7C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "RobotoBold",
  },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: "#EF4444",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: "#FFF5F5",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
    fontFamily: "RobotoBold",
    textAlign: "center",
  },
});
