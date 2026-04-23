import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Entypo, Ionicons } from "@expo/vector-icons";

const BRAND_GREEN = "#3C8F7C";
const PIN_RED = "#EF4444";

interface Props {
  fromLabel: string;
  toLabel: string;
}

export function TripDetailsCard({ fromLabel, toLabel }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.tripRow}>
        <Entypo name="location-pin" size={16} color={PIN_RED} />
        <Text style={styles.place} numberOfLines={1} ellipsizeMode="tail">
          {fromLabel}
        </Text>
        <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
        <Entypo name="location-pin" size={16} color={BRAND_GREEN} />
        <Text style={styles.place} numberOfLines={1} ellipsizeMode="tail">
          {toLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 22,
  },
  place: {
    flexShrink: 1,
    fontSize: 12,
    color: "#444",
    fontFamily: "RobotoRegular",
    lineHeight: 18,
  },
});
