import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { AntDesign } from "@expo/vector-icons";

const BRAND_GREEN = "#3C8F7C";

interface Props {
  title: string;
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
              <AntDesign name="user" size={18} color="#9CA3AF" />
            )}
          </View>
        )}

        <View style={styles.metaRow}>
          <View style={styles.mainLine}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {ratingText ? (
              <Text style={styles.rating} numberOfLines={1}>
                {ratingText}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
        </View>
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
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F5F2",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 13,
    color: BRAND_GREEN,
    fontFamily: "RobotoBold",
  },
  metaRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mainLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    minHeight: 22,
  },
  name: {
    fontSize: 15,
    color: "#111827",
    fontFamily: "RobotoBold",
  },
  rating: {
    fontSize: 12,
    color: "#111827",
    fontFamily: "RobotoMedium",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
  },
});

