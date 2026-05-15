import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RideState } from "./rideStates";

const BRAND_GREEN = "#3C8F7C";
const ERROR_RED = "#EF4444";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function IconButton({
  icon,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.85 },
      ]}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={22} color={BRAND_GREEN} />
    </Pressable>
  );
}

export function RiderActionButtons({
  state,
  onCall,
  onChat,
  onCancel,
  onEmergency,
}: {
  state: RideState;
  onCall: () => void;
  onChat: () => void;
  onCancel: () => void;
  onEmergency: () => void;
}) {
  const showEmergency = state === "trip_started" || state === "near_destination";
  const dangerLabel = showEmergency ? "Emergency" : "Cancel ride";
  const dangerPress = showEmergency ? onEmergency : onCancel;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <IconButton icon="call-outline" onPress={onCall} accessibilityLabel="Call driver" />
        <IconButton
          icon="chatbubble-ellipses-outline"
          onPress={onChat}
          accessibilityLabel="Chat with driver"
        />
      </View>

      <Pressable
        onPress={dangerPress}
        style={({ pressed }) => [
          styles.dangerBtn,
          showEmergency && styles.emergencyBtn,
          pressed && { opacity: 0.88 },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={dangerLabel}
      >
        <Text style={[styles.dangerText, showEmergency && styles.emergencyText]}>
          {dangerLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function DriverActionButtons({
  state,
  onOpenNavigation,
  onMarkArrived,
  onStartTrip,
  onCompleteTrip,
  onCall,
  onChat,
  onCancel,
  loading,
}: {
  state: RideState;
  onOpenNavigation: () => void;
  onMarkArrived: () => void;
  onStartTrip: () => void;
  onCompleteTrip: () => void;
  onCall: () => void;
  onChat: () => void;
  onCancel: () => void;
  loading?: { arrived?: boolean; start?: boolean; complete?: boolean };
}) {
  const primary = useMemo(() => {
    if (state === "heading_to_pickup") return { label: "Open Navigation", onPress: onOpenNavigation };
    if (state === "arrived_pickup") return { label: "Start Trip", onPress: onStartTrip };
    if (state === "trip_started" || state === "near_destination")
      return { label: "Complete Trip", onPress: onCompleteTrip };
    return { label: "Open Navigation", onPress: onOpenNavigation };
  }, [state, onOpenNavigation, onStartTrip, onCompleteTrip]);

  const secondary = useMemo(() => {
    if (state === "heading_to_pickup")
      return { label: "I’ve arrived", onPress: onMarkArrived, busy: !!loading?.arrived };
    if (state === "arrived_pickup")
      return { label: "Open Navigation", onPress: onOpenNavigation, busy: false };
    return { label: "Cancel", onPress: onCancel, busy: false };
  }, [state, onMarkArrived, onOpenNavigation, onCancel, loading?.arrived]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={primary.onPress}
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <View style={styles.primaryRow}>
          {primary.label === "Open Navigation" ? (
            <Ionicons name="navigate" size={18} color="#FFFFFF" />
          ) : null}
          <Text style={styles.primaryText}>{primary.label}</Text>
        </View>
      </Pressable>

      <View style={styles.rowBetween}>
        <Pressable
          onPress={secondary.onPress}
          style={({ pressed }) => [
            styles.secondaryBtn,
            secondary.label === "I\u2019ve arrived" && styles.secondaryBtnArrived,
            pressed && { opacity: 0.88 },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.secondaryText, secondary.label === "I\u2019ve arrived" && styles.secondaryTextArrived]}>
            {secondary.label}
          </Text>
        </Pressable>
        <View style={styles.row}>
          <IconButton icon="call-outline" onPress={onCall} accessibilityLabel="Call passenger" />
          <IconButton icon="chatbubble-ellipses-outline" onPress={onChat} accessibilityLabel="Chat passenger" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: BRAND_GREEN,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F9F4",
  },
  primaryBtn: {
    backgroundColor: BRAND_GREEN,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontFamily: "RobotoMedium",
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  secondaryBtnArrived: {
    borderColor: BRAND_GREEN,
    borderWidth: 1.5,
  },
  secondaryText: {
    fontSize: 14,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  secondaryTextArrived: {
    color: BRAND_GREEN,
    fontFamily: "RobotoMedium",
  },
  dangerBtn: {
    borderWidth: 1.5,
    borderColor: ERROR_RED,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: "#FFF5F5",
    alignItems: "center",
  },
  dangerText: {
    fontSize: 14,
    color: ERROR_RED,
    fontFamily: "RobotoBold",
  },
  emergencyBtn: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  emergencyText: {
    color: "#FFFFFF",
  },
});

