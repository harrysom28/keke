import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Entypo } from "@expo/vector-icons";

const BRAND_GREEN = "#3C8F7C";

interface Props {
  fromLabel: string;
  toLabel: string;
}

export function TripDetailsCard({ fromLabel, toLabel }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Trip</Text>
      <View style={styles.row}>
        <View style={styles.pinCol}>
          <Entypo name="location-pin" size={18} color="#EF4444" />
          <View style={styles.dashed} />
          <Entypo name="location-pin" size={18} color={BRAND_GREEN} />
        </View>
        <View style={styles.addrCol}>
          <View style={styles.block}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.value} numberOfLines={2}>
              {fromLabel}
            </Text>
          </View>
          <View style={[styles.block, { marginTop: 10 }]}>
            <Text style={styles.label}>To</Text>
            <Text style={styles.value} numberOfLines={2}>
              {toLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 2,
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
  title: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "RobotoBold",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  pinCol: {
    width: 22,
    alignItems: "center",
    paddingTop: 2,
  },
  dashed: {
    flex: 1,
    width: 2,
    marginVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  addrCol: {
    flex: 1,
  },
  block: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: "RobotoRegular",
    marginBottom: 3,
  },
  value: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "RobotoMedium",
    lineHeight: 18,
  },
});

