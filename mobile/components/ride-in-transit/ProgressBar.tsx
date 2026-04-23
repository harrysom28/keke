import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import type { RideState } from "./rideStates";

const BRAND_GREEN = "#3C8F7C";

interface Props {
  label: string; // "Pickup → Dropoff"
  state: RideState;
}

function progressForState(state: RideState) {
  switch (state) {
    case "heading_to_pickup":
      return 0.25;
    case "arrived_pickup":
      return 0.45;
    case "trip_started":
      return 0.7;
    case "near_destination":
      return 0.9;
    case "completed":
      return 1;
  }
}

export function ProgressBar({ label, state }: Props) {
  const progress = useMemo(() => progressForState(state), [state]);
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [progress, anim]);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.percent}>{Math.round(progress * 100)}%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  percent: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#EEF2F7",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: BRAND_GREEN,
  },
});

