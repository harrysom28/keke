import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const BRAND_GREEN = "#3C8F7C";

interface Props {
  /** Optional small label above the name (e.g. “Driver” / “Passenger”). */
  title?: string;
  imageUrl?: string | null;
  name: string;
  ratingText?: string | null; // "4.8 (120 trips)"
  subtitle?: string | null; // "Toyota Camry • KJA-234-AB"
  rightSlot?: React.ReactNode;
}

export function UserInfoCard({
  title,
  imageUrl,
  name,
  ratingText,
  subtitle,
  rightSlot,
}: Props) {
  const cleanedImage = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const hasImage = !!cleanedImage;
  const initials = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {hasImage ? (
          <Image source={{ uri: cleanedImage }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            {initials ? (
              <Text style={styles.initials}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={22} color="#9CA3AF" />
            )}
          </View>
        )}

        <View style={styles.metaColumn}>
          {title ? (
            <Text style={styles.titleLabel} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {ratingText ? (
            <Text style={styles.rating} numberOfLines={1}>
              {ratingText}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  metaColumn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 4,
  },
  titleLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontFamily: "RobotoRegular",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E8F5F2",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 16,
    color: BRAND_GREEN,
    fontFamily: "RobotoBold",
  },
  name: {
    fontSize: 17,
    color: "#111827",
    fontFamily: "RobotoBold",
  },
  rating: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
    flexShrink: 1,
    lineHeight: 18,
  },
});
