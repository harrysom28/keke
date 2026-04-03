import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import type { LatLng } from "@/utils/polylineDecoder";

interface PickupPulseMarkerProps {
  coordinate: LatLng;
}

export function PickupPulseMarker({ coordinate }: PickupPulseMarkerProps) {
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
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
      <View style={styles.container}>
        {/* Pulse ring */}
        <Animated.View
          style={[
            styles.pulse,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
        {/* Centre dot */}
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}

const BRAND_GREEN = "#2E7D52";

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
