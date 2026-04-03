import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, StyleSheet, Text } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { LocationEngine } from "../engines/locationEngine";
import { DriverEngine } from "../engines/driverEngine";
import { RideEngine } from "../engines/rideEngine";
import type { RideState } from "../types/ride";
import type { DriverMapItem } from "../types/driver";
import { UserMarker } from "../components/UserMarker";
import { DriverMarker } from "../components/DriverMarker";
import { BottomUI } from "../components/BottomUI";
import { LIGHT_DESATURATED_MAP_STYLE } from "@/constants/mapStyle";
import type { LatLng } from "@/utils/polylineDecoder";
import { getMapboxToken } from "@/components/map/MapboxMap";
import MapboxMap, { type MapboxMapRef } from "@/components/map/MapboxMap";

const DEFAULT_REGION = {
  latitude: 9.082,
  longitude: 8.6753,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

const CLUSTER_ZOOM_THRESHOLD = 13;
const ROUTE_STROKE_WIDTH = 5;
const ROUTE_SHADOW_WIDTH = ROUTE_STROKE_WIDTH + 2;
const ROUTE_COLOR = "#3C8F7C";
const ROUTE_SHADOW_COLOR = "rgba(0,0,0,0.25)";
const FIT_EDGE_PADDING = { top: 100, right: 60, bottom: 300, left: 60 };
const FIT_ANIMATION_MS = 600;

export interface MapScreenProps {
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  mapRef?: React.RefObject<MapView | MapboxMapRef | null>;
  children?: React.ReactNode;
  /** Route polyline coords from useRoute; when set, polyline is drawn and map fits to route */
  routeCoords?: LatLng[];
  routeLoading?: boolean;
  /** Called when route has loaded (for parent to show ETA/distance in sheet) */
  onRouteReady?: (coords: LatLng[]) => void;
  /** Duration label at pickup (e.g. "15 min") – shown at route start when set */
  etaLabel?: string | null;
  /** Arrival time at dropoff (e.g. "Arrive by 18:19") – shown at route end when set */
  arriveByLabel?: string | null;
}

export function MapScreen({
  pickup,
  dropoff,
  mapRef: mapRefProp,
  children,
  routeCoords = [],
  routeLoading,
  onRouteReady,
  etaLabel,
  arriveByLabel,
}: MapScreenProps) {
  const mapRefInternal = useRef<MapView | MapboxMapRef>(null);
  const mapRef = mapRefProp ?? mapRefInternal;
  const routeFittedRef = useRef(false);
  const useMapbox = Boolean(getMapboxToken());
  const [userLocation, setUserLocation] = useState({
    latitude: 0,
    longitude: 0,
    heading: null as number | null,
  });
  const [drivers, setDrivers] = useState<DriverMapItem[]>([]);
  const [rideState, setRideState] = useState<RideState>(RideEngine.getState());
  const [zoomLevel, setZoomLevel] = useState(15);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const unsubLoc = LocationEngine.subscribe((u) => {
      setUserLocation({
        latitude: u.latitude,
        longitude: u.longitude,
        heading: typeof u.heading === "number" && u.heading >= 0 ? u.heading : null,
      });
    });
    LocationEngine.start();

    const unsubDrivers = DriverEngine.subscribe((list) => {
      setDrivers(list);
    });
    DriverEngine.start();

    const unsubRide = RideEngine.subscribe((state) => {
      setRideState(state);
    });

    return () => {
      unsubLoc();
      unsubDrivers();
      unsubRide();
      DriverEngine.stop();
      LocationEngine.stop();
    };
  }, []);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const onRegionChangeComplete = useCallback((region: { latitudeDelta: number }) => {
    const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
    setZoomLevel(Math.min(21, Math.max(8, zoom)));
  }, []);

  useEffect(() => {
    if (routeCoords.length === 0) {
      routeFittedRef.current = false;
      return;
    }
    if (!mapRef?.current || routeFittedRef.current) return;
    routeFittedRef.current = true;
    onRouteReady?.(routeCoords);
    mapRef.current.fitToCoordinates?.(routeCoords, {
      edgePadding: FIT_EDGE_PADDING,
      animated: true,
    });
  }, [routeCoords, mapRef, onRouteReady]);

  const showDrivers = zoomLevel >= CLUSTER_ZOOM_THRESHOLD;
  const hasValidUser =
    userLocation.latitude !== 0 && userLocation.longitude !== 0;

  const initialRegion =
    hasValidUser && mapReady === false
      ? {
          ...userLocation,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }
      : DEFAULT_REGION;

  return (
    <View style={StyleSheet.absoluteFill}>
      {useMapbox ? (
        <View style={StyleSheet.absoluteFillObject} renderToHardwareTextureAndroid>
          <MapboxMap
            ref={mapRef as React.RefObject<MapboxMapRef>}
            style={StyleSheet.absoluteFillObject}
            centerCoordinate={hasValidUser ? [userLocation.longitude, userLocation.latitude] : [DEFAULT_REGION.longitude, DEFAULT_REGION.latitude]}
            zoomLevel={zoomLevel}
            onMapReady={onMapReady}
            routeCoords={routeCoords}
            pickup={pickup && pickup.latitude !== 0 && pickup.longitude !== 0 ? pickup : undefined}
            destination={dropoff && dropoff.latitude !== 0 && dropoff.longitude !== 0 ? dropoff : undefined}
            userLocation={hasValidUser ? userLocation : undefined}
            markers={showDrivers ? drivers.map((d) => ({ id: d.id, latitude: d.latitude, longitude: d.longitude })) : []}
            etaLabel={etaLabel}
            arriveByLabel={arriveByLabel}
          />
        </View>
      ) : (
        <View style={StyleSheet.absoluteFillObject} renderToHardwareTextureAndroid>
          <MapView
            ref={mapRef as React.RefObject<MapView>}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            onMapReady={onMapReady}
            onRegionChangeComplete={onRegionChangeComplete}
            showsPointsOfInterest={true}
            showsBuildings={false}
            showsTraffic={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            customMapStyle={LIGHT_DESATURATED_MAP_STYLE}
            mapType="standard"
            loadingEnabled={true}
            scrollEnabled={true}
            zoomEnabled={true}
          >
          <UserMarker
            latitude={userLocation.latitude}
            longitude={userLocation.longitude}
            heading={userLocation.heading}
          />
          {showDrivers &&
            drivers.map((d) => (
              <DriverMarker key={d.id} driver={d} />
            ))}
          {pickup &&
            pickup.latitude !== 0 &&
            pickup.longitude !== 0 && (
              <Marker coordinate={pickup} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }} pinColor={ROUTE_COLOR} />
            )}
          {dropoff &&
            dropoff.latitude !== 0 &&
            dropoff.longitude !== 0 && (
              <Marker coordinate={dropoff} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }} pinColor="#e74c3c" />
            )}
          {routeCoords.length > 0 && (
            <>
              <Polyline
                coordinates={routeCoords}
                strokeWidth={ROUTE_SHADOW_WIDTH}
                strokeColor={ROUTE_SHADOW_COLOR}
                lineCap="round"
                lineJoin="round"
                zIndex={1}
              />
              <Polyline
                coordinates={routeCoords}
                strokeWidth={ROUTE_STROKE_WIDTH}
                strokeColor={ROUTE_COLOR}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            </>
          )}
          </MapView>
        </View>
      )}
      {routeLoading && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center", pointerEvents: "none" }]}>
          <View style={{ backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
            <ActivityIndicator size="small" color={ROUTE_COLOR} />
          </View>
        </View>
      )}
      <BottomUI>{children}</BottomUI>
    </View>
  );
}

const styles = StyleSheet.create({
  routeEndContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 4,
  },
  pinDotPickup: { backgroundColor: ROUTE_COLOR },
  pinDotDropoff: { backgroundColor: "#e74c3c" },
  etaPill: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  etaPillDuration: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(60, 143, 124, 0.4)",
  },
  etaPillArrive: {
    backgroundColor: "#5B21B6",
    borderWidth: 0,
  },
  etaPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1f2937",
  },
  etaPillTextArrive: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
});

