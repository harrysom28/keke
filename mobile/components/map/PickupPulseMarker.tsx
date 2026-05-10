import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import type { LatLng } from "@/utils/polylineDecoder";

interface PickupPulseMarkerProps {
  coordinate: LatLng;
  etaLabel?: string;
  /** Passed through for react-native-map-clustering */
  cluster?: boolean;
}

export function PickupPulseMarker({ coordinate, etaLabel, cluster }: PickupPulseMarkerProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });

  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={Boolean(etaLabel)}
      cluster={cluster}
    >
      <View style={[styles.container, etaLabel ? styles.containerWithEta : null]}>
        <View style={styles.markerBody}>
          <Animated.View
            style={[
              styles.pulse,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View style={styles.dot} />
        </View>
        {etaLabel ? (
          <View style={styles.etaPill}>
            <Text style={styles.etaPillText} numberOfLines={1}>
              {etaLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

const BRAND_GREEN = "#2E7D52";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  containerWithEta: {
    paddingBottom: 4,
  },
  markerBody: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  etaPill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: BRAND_GREEN,
    maxWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
  etaPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  pulse: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND_GREEN,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
