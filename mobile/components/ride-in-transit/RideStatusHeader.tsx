import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { RideState } from "./rideStates";

const BRAND_GREEN = "#3C8F7C";

interface Props {
  state: RideState;
  title: string;
  subtitle?: string;
  arrivingBy?: string | null;
  reassurance?: string;
}

type IonIconName = React.ComponentProps<typeof Ionicons>["name"];

const STATE_ICONS: Record<RideState, IonIconName> = {
  heading_to_pickup: "navigate-outline",
  arrived_pickup: "checkmark-circle-outline",
  trip_started: "car-outline",
  near_destination: "location-outline",
  completed: "happy-outline",
};

export function RideStatusHeader({ state, title, subtitle, arrivingBy, reassurance }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [shownTitle, setShownTitle] = useState(title);
  const [shownSubtitle, setShownSubtitle] = useState(subtitle ?? "");

  useEffect(() => {
    const nextTitle = title;
    const nextSubtitle = subtitle ?? "";
    if (nextTitle === shownTitle && nextSubtitle === shownSubtitle) return;

    Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    setShownTitle(nextTitle);
    setShownSubtitle(nextSubtitle);
  }, [title, subtitle, shownTitle, shownSubtitle, opacity]);

  const iconName = useMemo(() => STATE_ICONS[state] ?? "information-circle-outline", [state]);

  return (
    <View style={styles.container}>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Ionicons name={iconName} size={18} color={BRAND_GREEN} />
          <Text style={styles.pillText}>{shownTitle}</Text>
        </View>
        {arrivingBy ? (
          <View style={styles.etaPill}>
            <Text style={styles.etaLabel}>Arriving by</Text>
            <Text style={styles.etaValue}>{arrivingBy}</Text>
          </View>
        ) : null}
      </View>

      <Animated.View style={{ opacity }}>
        {shownSubtitle ? <Text style={styles.subtitle}>{shownSubtitle}</Text> : null}
        {reassurance ? <Text style={styles.reassurance}>{reassurance}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#F4FBF9",
    borderWidth: 1,
    borderColor: "#D3EDE8",
  },
  pillText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontFamily: "RobotoBold",
  },
  etaPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "flex-end",
  },
  etaLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
  },
  etaValue: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 13,
    color: "#374151",
    fontFamily: "RobotoRegular",
  },
  reassurance: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
  },
});
