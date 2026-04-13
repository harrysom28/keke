import React, { memo, useEffect, useRef } from "react";
import { AnimatedRegion, Marker } from "react-native-maps";

export interface LiveDriverMarkerProps {
  latitude: number;
  longitude: number;
  heading?: number | null;
}

function LiveDriverMarkerComponent({
  latitude,
  longitude,
  heading,
}: LiveDriverMarkerProps) {
  const coordinate = useRef(
    new AnimatedRegion({
      latitude,
      longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  ).current;

  useEffect(() => {
    coordinate
      .timing({
        latitude,
        longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 600,
        useNativeDriver: false,
      })
      .start();
  }, [latitude, longitude, coordinate]);

  const rotation =
    typeof heading === "number" && !Number.isNaN(heading) && heading >= 0
      ? heading
      : 0;

  return (
    <Marker.Animated
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={rotation}
      tracksViewChanges={false}
      image={require("@images/keke-svg.png")}
      cluster={false}
    />
  );
}

export const LiveDriverMarker = memo(
  LiveDriverMarkerComponent,
  (prev, next) =>
    prev.latitude === next.latitude &&
    prev.longitude === next.longitude &&
    prev.heading === next.heading
);
