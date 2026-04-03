import type MapView from "react-native-maps";

export interface MapRef {
  current: MapView | null;
}

export interface Coord {
  latitude: number;
  longitude: number;
}

const DEFAULT_DURATION = 400;

export function centerOnUser(
  mapRef: MapRef,
  coords: Coord,
  options?: { latitudeDelta?: number; longitudeDelta?: number }
): void {
  const map = mapRef?.current;
  if (!map || coords.latitude === 0) return;
  const latDelta = options?.latitudeDelta ?? 0.012;
  const lngDelta = options?.longitudeDelta ?? 0.012;
  map.animateToRegion(
    {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    },
    DEFAULT_DURATION
  );
}

export function fitToCoordinates(
  mapRef: MapRef,
  coordsArray: Coord[],
  edgePadding?: { top: number; right: number; bottom: number; left: number }
): void {
  const map = mapRef?.current;
  if (!map || !coordsArray.length) return;
  const padding =
    edgePadding ??
    { top: 80, right: 40, bottom: 80, left: 40 };
  map.fitToCoordinates(coordsArray, {
    edgePadding: padding,
    animated: true,
  });
}

export function animateToDriver(
  mapRef: MapRef,
  driverCoords: Coord,
  options?: { latitudeDelta?: number; longitudeDelta?: number }
): void {
  const map = mapRef?.current;
  if (!map) return;
  const latDelta = options?.latitudeDelta ?? 0.008;
  const lngDelta = options?.longitudeDelta ?? 0.008;
  map.animateToRegion(
    {
      latitude: driverCoords.latitude,
      longitude: driverCoords.longitude,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    },
    DEFAULT_DURATION
  );
}
