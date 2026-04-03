import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Linking,
} from "react-native";
import { AntDesign, MaterialIcons, Entypo } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import tw from "@/lib/tailwind";
import apiClient from "@/utils/apiClient";
import { showMessage } from "react-native-flash-message";

interface RideDetails {
  ride_id: string;
  status: string;
  origin: { name?: string; address: string; lat?: number; lng?: number };
  destination: { name?: string; address: string; lat?: number; lng?: number };
  date: string;
  scheduled_at?: string | null;
  distance_km: number;
  duration_min: number;
  payment_method: string;
  payment_status: string;
  fare_breakdown?: {
    ride_fare: number;
    service_charge: number;
    total_paid: number;
    currency: string;
  };
  earnings_breakdown?: {
    gross: number;
    platform_fee: number;
    net: number;
    currency: string;
  };
  driver?: {
    name: string | null;
    phone: string | null;
    image: string | null;
    vehicle_name: string | null;
    vehicle_plate: string | null;
  } | null;
  rider?: {
    name: string | null;
    phone: string | null;
  } | null;
}

const getCurrencyPrefix = (currency = "NGN") => {
  const normalized = String(currency || "NGN").toUpperCase();
  if (normalized === "NGN") return "₦";
  if (normalized === "USD") return "₦";
  return `${normalized} `;
};

const formatAmount = (n: number, currency = "NGN") => {
  return `${getCurrencyPrefix(currency)}${n.toLocaleString()}`;
};

const formatDate = (d: string) => {
  try {
    const date = new Date(d);
    return date.toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d || "";
  }
};

const formatTime = (d: string) => {
  try {
    const date = new Date(d);
    return date.toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
};

export default function RideDetailsScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<RideDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) {
      setError("No ride ID provided");
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get(`booking/rides/${rideId}`)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data?.data?.ride;
        if (data) setRide(data);
        else setError("Invalid response");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load ride details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  const handleReportIssue = () => {
    router.push({
      pathname: "/(app)/(tabs)/(profile)/contact",
      params: ride?.ride_id ? { rideId: ride.ride_id } : undefined,
    });
  };

  const handleRideAgain = () => {
    if (!ride) return;
    const dropoffName = ride.destination?.name || ride.destination?.address || "";
    const dropoffLat = ride.destination?.lat || 0;
    const dropoffLng = ride.destination?.lng || 0;
    router.push({
      pathname: "/(app)/(tabs)/(home)/home",
      params: {
        rebook_dropoff_name: dropoffName,
        rebook_dropoff_lat: String(dropoffLat),
        rebook_dropoff_lng: String(dropoffLng),
      },
    });
  };

  const handleCallDriver = () => {
    const phone = ride?.driver?.phone;
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/\D/g, "").replace(/^0/, "+234")}`);
    } else {
      showMessage({ type: "info", message: "Driver phone not available" });
    }
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-white`}>
        <ActivityIndicator size="large" color="#3C8F7C" />
      </View>
    );
  }

  if (error || !ride) {
    return (
      <View style={tw`flex-1 justify-center items-center px-6 bg-white`}>
        <Text style={tw`text-base text-[#8E8E93] text-center mb-4`}>{error || "Ride not found"}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={tw`bg-base-green px-6 py-3 rounded-lg`}
        >
          <Text style={tw`text-white font-medium`}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isRider = !!ride.fare_breakdown;

  return (
    <View style={tw`flex-1 bg-white`}>
      <StatusBar barStyle="dark-content" />
      <View style={tw`bg-[#3C8F7CE6] px-4 pt-12 pb-5`}>
        <View style={tw`flex-row items-center justify-between`}>
          <TouchableOpacity onPress={() => router.back()} style={tw`p-1`}>
            <AntDesign name="left" size={24} color="white" />
          </TouchableOpacity>
          <Text style={tw`text-white text-lg font-bold`}>Ride Details</Text>
          <View style={tw`w-8`} />
        </View>
      </View>

      <ScrollView contentContainerStyle={tw`px-5 py-4 pb-8`}>
        {/* Route */}
        <View style={tw`mb-6`}>
          <View style={tw`flex-row items-start`}>
            <View style={tw`mr-3`}>
              <Entypo name="location-pin" size={20} color="#F44336" style={tw`mt-0.5`} />
              <View style={tw`w-0.5 h-8 ml-2 border-l-2 border-dashed border-[#C8C7CC]`} />
              <Entypo name="location-pin" size={20} color="#4CAF50" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-base text-[#242E42] font-medium mb-1`} numberOfLines={2}>
                {ride.origin?.name || ride.origin?.address || "Pickup"}
              </Text>
              <Text style={tw`text-sm text-[#8E8E93] mb-4`} numberOfLines={1}>
                {ride.origin?.address}
              </Text>
              <Text style={tw`text-base text-[#242E42] font-medium mb-1`} numberOfLines={2}>
                {ride.destination?.name || ride.destination?.address || "Drop-off"}
              </Text>
              <Text style={tw`text-sm text-[#8E8E93]`} numberOfLines={1}>
                {ride.destination?.address}
              </Text>
            </View>
          </View>
        </View>

        {/* Date & Status */}
        <View style={tw`flex-row justify-between mb-4 pb-4 border-b border-[#F0F0F0]`}>
          <View>
            <Text style={tw`text-xs text-[#8E8E93] mb-1`}>Date</Text>
            <Text style={tw`text-base text-[#242E42] font-medium`}>
              {formatDate(ride.date)} · {formatTime(ride.date)}
            </Text>
          </View>
          <View style={tw`items-end`}>
            <Text style={tw`text-xs text-[#8E8E93] mb-1`}>Status</Text>
            <Text style={tw`text-base text-[#242E42] font-medium capitalize`}>{ride.status}</Text>
          </View>
        </View>

        {/* Driver (rider view) */}
        {isRider && ride.driver && (
          <View style={tw`mb-6`}>
            <Text style={tw`text-base font-semibold text-[#242E42] mb-3`}>Driver</Text>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={tw`text-base text-[#242E42] font-medium`}>{ride.driver.name || "Driver"}</Text>
                <Text style={tw`text-sm text-[#8E8E93]`}>
                  {ride.driver.vehicle_name || ""} {ride.driver.vehicle_plate ? `· ${ride.driver.vehicle_plate}` : ""}
                </Text>
              </View>
              {ride.driver.phone && (
                <TouchableOpacity onPress={handleCallDriver} style={tw`bg-base-green/10 px-4 py-2 rounded-lg`}>
                  <Text style={tw`text-base-green font-medium`}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Fare breakdown (rider) */}
        {ride.fare_breakdown && (
          <View style={tw`mb-6`}>
            <Text style={tw`text-base font-semibold text-[#242E42] mb-3`}>Fare Breakdown</Text>
            <View style={tw`bg-[#F8F8F8] rounded-lg p-4`}>
              <View style={tw`flex-row justify-between mb-2`}>
                <Text style={tw`text-sm text-[#8E8E93]`}>Ride fare</Text>
                <Text style={tw`text-sm text-[#242E42] font-medium`}>
                  {formatAmount(ride.fare_breakdown.ride_fare, ride.fare_breakdown.currency)}
                </Text>
              </View>
              {ride.fare_breakdown.service_charge > 0 && (
                <View style={tw`flex-row justify-between mb-2`}>
                  <Text style={tw`text-sm text-[#8E8E93]`}>Service charge</Text>
                  <Text style={tw`text-sm text-[#242E42] font-medium`}>
                    {formatAmount(ride.fare_breakdown.service_charge, ride.fare_breakdown.currency)}
                  </Text>
                </View>
              )}
              <View style={tw`flex-row justify-between mt-2 pt-2 border-t border-[#E5E5E5]`}>
                <Text style={tw`text-base font-semibold text-[#242E42]`}>Total paid</Text>
                <Text style={tw`text-base font-semibold text-[#242E42]`}>
                  {formatAmount(ride.fare_breakdown.total_paid, ride.fare_breakdown.currency)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Earnings breakdown (driver) */}
        {ride.earnings_breakdown && (
          <View style={tw`mb-6`}>
            <Text style={tw`text-base font-semibold text-[#242E42] mb-3`}>Earnings</Text>
            <View style={tw`bg-[#F8F8F8] rounded-lg p-4`}>
              <View style={tw`flex-row justify-between mb-2`}>
                <Text style={tw`text-sm text-[#8E8E93]`}>Gross</Text>
                <Text style={tw`text-sm text-[#242E42] font-medium`}>
                  {formatAmount(ride.earnings_breakdown.gross, ride.earnings_breakdown.currency)}
                </Text>
              </View>
              <View style={tw`flex-row justify-between mb-2`}>
                <Text style={tw`text-sm text-[#8E8E93]`}>Platform fee</Text>
                <Text style={tw`text-sm text-[#242E42] font-medium`}>
                  -{formatAmount(ride.earnings_breakdown.platform_fee, ride.earnings_breakdown.currency)}
                </Text>
              </View>
              <View style={tw`flex-row justify-between mt-2 pt-2 border-t border-[#E5E5E5]`}>
                <Text style={tw`text-base font-semibold text-[#242E42]`}>Net earnings</Text>
                <Text style={tw`text-base font-semibold text-base-green`}>
                  {formatAmount(ride.earnings_breakdown.net, ride.earnings_breakdown.currency)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={tw`gap-3`}>
          <TouchableOpacity
            onPress={handleReportIssue}
            style={tw`flex-row items-center justify-center py-3 rounded-lg border border-[#E5E5E5]`}
          >
            <MaterialIcons name="report-problem" size={20} color="#3C8F7C" style={tw`mr-2`} />
            <Text style={tw`text-base text-[#242E42] font-medium`}>Report Issue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRideAgain}
            style={tw`flex-row items-center justify-center py-3 rounded-lg bg-base-green`}
          >
            <AntDesign name="reload" size={18} color="white" style={tw`mr-2`} />
            <Text style={tw`text-base text-white font-medium`}>Ride Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
