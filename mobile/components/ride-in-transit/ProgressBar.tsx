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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    minHeight: 16,
  },
  label: {
    fontSize: 12,
    color: "#666",
    fontFamily: "RobotoMedium",
  },
  percent: {
    fontSize: 12,
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
  },
  track: {
    height: 4,
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

