import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Linking } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

/**
 * Street View screen – opens Google Street View for a coordinate.
 * Uses system browser (no extra deps). For in-app Street View, add react-native-streetview.
 * Navigate: router.push({ pathname: "/street-view", params: { latitude, longitude } });
 */
export default function StreetViewScreen() {
  const params = useLocalSearchParams<{ latitude: string; longitude: string }>();
  const latitude = params.latitude ? parseFloat(params.latitude) : null;
  const longitude = params.longitude ? parseFloat(params.longitude) : null;

  const isValid = latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude);

  const streetViewUrl = isValid
    ? `https://www.google.com/maps?q=${latitude},${longitude}&layer=c`
    : null;

  const openStreetView = () => {
    if (streetViewUrl) Linking.openURL(streetViewUrl);
  };

  if (!isValid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Street View</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.message}>Missing or invalid coordinates.</Text>
          <Text style={styles.hint}>Pass latitude and longitude as params.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Street View</Text>
      </View>
      <View style={styles.centered}>
        <Text style={styles.coords}>
          {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
        </Text>
        <TouchableOpacity style={styles.button} onPress={openStreetView}>
          <Ionicons name="map" size={22} color="#fff" />
          <Text style={styles.buttonText}>Open in Google Maps</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Street View opens in your browser.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 18, fontWeight: "600", color: "#333" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  message: { fontSize: 16, color: "#333", marginBottom: 8 },
  coords: { fontSize: 14, color: "#666", marginBottom: 24 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2E8B57",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  hint: { fontSize: 14, color: "#666", marginTop: 16 },
});
