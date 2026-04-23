import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { AntDesign } from "@expo/vector-icons";

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
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>

      <View style={styles.row}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <AntDesign name="user" size={22} color="#9CA3AF" />
          </View>
        )}

        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {ratingText ? <Text style={styles.rating}>{ratingText}</Text> : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "RobotoBold",
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    color: "#111827",
    fontFamily: "RobotoBold",
    marginBottom: 2,
  },
  rating: {
    fontSize: 12,
    color: "#111827",
    fontFamily: "RobotoMedium",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
  },
});

