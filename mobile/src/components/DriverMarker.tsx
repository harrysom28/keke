import React, { useMemo, memo } from "react";
import { Marker } from "react-native-maps";
import type { DriverMapItem } from "../types/driver";

interface DriverMarkerProps {
  driver: DriverMapItem;
  /** Passed when used inside react-native-map-clustering so the marker can be clustered */
  coordinate?: { latitude: number; longitude: number };
}

function DriverMarkerComponent({ driver, coordinate: coordinateProp }: DriverMarkerProps) {
  const coordinate = useMemo(
    () => coordinateProp ?? { latitude: driver.latitude, longitude: driver.longitude },
    [coordinateProp, driver.latitude, driver.longitude]
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      tracksViewChanges={false}
      rotation={driver.heading}
      image={require("@images/keke-svg.png")}
    />
  );
}

export const DriverMarker = memo(
  DriverMarkerComponent,
  (prev, next) =>
    prev.driver.latitude === next.driver.latitude &&
    prev.driver.longitude === next.driver.longitude &&
    prev.driver.heading === next.driver.heading
);
