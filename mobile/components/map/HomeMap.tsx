/**
 * Bolt-style home map: camera padding, smart zoom, driver clustering,
 * pickup pulse, minimal style, 3km driver filter, throttled updates.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView from "react-native-map-clustering";
import { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSelector } from "react-redux";

import { LiveDriverMarker } from "@/components/find-ride/LiveDriverMarker";
import { LocationEngine } from "@/src/engines/locationEngine";
import { DriverEngine } from "@/src/engines/driverEngine";
import { UserMarker } from "@/src/components/UserMarker";
import { DriverMarker } from "@/src/components/DriverMarker";
import { PickupPulseMarker } from "./PickupPulseMarker";
import { AppDetailsState } from "@/store/AppSlice";
import { isDriverNearby, haversineKm } from "@/utils/haversine";
import type { LatLng } from "@/utils/polylineDecoder";
import type { DriverMapItem } from "@/src/types/driver";

const MAP_PADDING_BY_STATE: Record<MapState, { top: number; bottom: number; left: number; right: number }> = {
  idle: { top: 120, bottom: 85, left: 40, right: 40 },
  searching: { top: 120, bottom: 420, left: 40, right: 40 },
  route: { top: 120, bottom: 420, left: 40, right: 40 },
  active: { top: 120, bottom: 420, left: 40, right: 40 },
};
const LEGAL_LABEL_INSETS_BY_STATE: Record<MapState, { top: number; left: number; bottom: number; right: number }> = {
  idle: { top: 0, left: 8, bottom: 6, right: 0 },
  searching: { top: 0, left: 8, bottom: 6, right: 0 },
  route: { top: 0, left: 8, bottom: 6, right: 0 },
  active: { top: 0, left: 8, bottom: 6, right: 0 },
};
const DRIVER_UPDATE_THROTTLE_MS = 3000;
const ZOOM_IDLE = 15.5;
const ZOOM_SEARCHING = 16;
const ZOOM_ACTIVE = 17;
const ROUTE_COLOR = "#3C8F7C";
/** Slim main line; shadow = main + small halo (reads smoother than a single thick stroke). */
const ROUTE_STROKE_WIDTH = 4;
const ROUTE_SHADOW_WIDTH = 5.5;
const FIT_EDGE_PADDING = { top: 80, right: 60, bottom: 60, left: 60 };
const ZOOM_DELTA = 0.007; // Slightly wider idle zoom
const MAX_FIT_DISTANCE_KM = 150; // beyond this, center on pickup to avoid continental zoom
const ABAKALIKI_REGION = {
  latitude: 6.3249,
  longitude: 8.1137,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const POI_GREY = "#6b7280";
const KEKE_MAP_STYLE = [
  // POIs: show key points, all same grey color for labels and icon tint
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: POI_GREY }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#e5e7eb" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#9ca3af" }],
  },
  {
    featureType: "poi.attraction",
    elementType: "all",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi.attraction",
    elementType: "labels.text.fill",
    stylers: [{ color: POI_GREY }],
  },
  {
    featureType: "poi.medical",
    elementType: "all",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi.medical",
    elementType: "labels.text.fill",
    stylers: [{ color: POI_GREY }],
  },
  {
    featureType: "poi.business",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }],
  },
  {
    featureType: "poi.business",
    elementType: "labels.text.fill",
    stylers: [{ color: POI_GREY }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ visibility: "on" }, { color: "#e8f5e9" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: POI_GREY }],
  },
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },
  // Roads: grey for better visibility
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#b0b4b8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#8c9096" }, { weight: 1.5 }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#a4a8ae" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ visibility: "simplified" }, { color: "#c4c8cc" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }],
  },
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#424242" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "landscape",
    elementType: "all",
    stylers: [{ color: "#e8eaed" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#c9e4f0" }],
  },
  {
    featureType: "water",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#424242" }],
  },
];

export type MapState = "idle" | "searching" | "route" | "active";

export interface HomeMapProps {
  mapRef: React.RefObject<MapView | null>;
  /** Current map context for zoom/camera */
  mapState: MapState;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  /** Optional: pass current location from parent so the pointer shows immediately */
  userLocation?: { latitude: number; longitude: number; heading?: number | null };
  routeCoords?: LatLng[];
  routeLoading?: boolean;
  etaLabel?: string | null;
  arriveByLabel?: string | null;
  onRouteReady?: (coords: LatLng[]) => void;
  children?: React.ReactNode;
  pauseDriverUpdates?: boolean;
  /** Rider active-ride status from API (e.g. accepted, arrived) — used with Redux driverLiveLocation */
  riderActiveRideStatus?: string | null;
}

function HomeMapComponent({
  mapRef,
  mapState,
  pickup,
  dropoff,
  userLocation: userLocationProp,
  routeCoords = [],
  routeLoading,
  etaLabel,
  arriveByLabel,
  onRouteReady,
  children,
  pauseDriverUpdates = false,
  riderActiveRideStatus = null,
}: HomeMapProps) {
  const [engineLocation, setEngineLocation] = useState({
    latitude: 0,
    longitude: 0,
    heading: null as number | null,
  });
  const [drivers, setDrivers] = useState<DriverMapItem[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const driverLiveLocation = useSelector(
    (s) => AppDetailsState(s).ride?.utils?.driverLiveLocation ?? null
  );
  const riderStatusLower = String(riderActiveRideStatus ?? "").toLowerCase();
  const showLiveAssignedDriver =
    !!driverLiveLocation &&
    typeof driverLiveLocation.lat === "number" &&
    typeof driverLiveLocation.lng === "number" &&
    (riderStatusLower === "accepted" || riderStatusLower === "arrived");
  const routeFittedRef = useRef(false);
  const lastDriverUpdateRef = useRef(0);

  const userLocation = useMemo(() => {
    const fromProp =
      userLocationProp &&
      typeof userLocationProp.latitude === "number" &&
      typeof userLocationProp.longitude === "number" &&
      userLocationProp.latitude !== 0 &&
      userLocationProp.longitude !== 0
        ? userLocationProp
        : null;
    if (fromProp) return fromProp;
    return engineLocation;
  }, [userLocationProp?.latitude, userLocationProp?.longitude, engineLocation.latitude, engineLocation.longitude]);

  /**
   * Prefer LocationEngine heading (BestForNavigation + movement bearing fallback).
   * Parent `useCurrentLocation` updates slowly and often reports heading 0 before a real fix — that
   * would lock the beam to north and override GPS/course from the engine.
   */
  const userHeading = useMemo(() => {
    const fromEngine = engineLocation.heading;
    if (typeof fromEngine === "number" && fromEngine >= 0) return fromEngine;
    const fromProp = userLocationProp?.heading;
    if (typeof fromProp === "number" && fromProp >= 0) return fromProp;
    return null;
  }, [userLocationProp?.heading, engineLocation.heading]);

  const mapPadding = useMemo(
    () => MAP_PADDING_BY_STATE[mapState] ?? MAP_PADDING_BY_STATE.idle,
    [mapState]
  );
  const legalLabelInsets = useMemo(
    () => LEGAL_LABEL_INSETS_BY_STATE[mapState] ?? LEGAL_LABEL_INSETS_BY_STATE.idle,
    [mapState]
  );

  useEffect(() => {
    const unsubLoc = LocationEngine.subscribe((u) => {
      setEngineLocation({
        latitude: u.latitude,
        longitude: u.longitude,
        heading: typeof u.heading === "number" && u.heading >= 0 ? u.heading : null,
      });
    });
    LocationEngine.start();
    const unsubDrivers = DriverEngine.subscribe((list) => {
      if (pauseDriverUpdates) return;
      const now = Date.now();
      if (now - lastDriverUpdateRef.current >= DRIVER_UPDATE_THROTTLE_MS) {
        lastDriverUpdateRef.current = now;
        setDrivers(list);
      }
    });
    DriverEngine.start();
    const initial = DriverEngine.getDrivers();
    if (initial.length) setDrivers(initial);
    return () => {
      unsubLoc();
      unsubDrivers();
      DriverEngine.stop();
      LocationEngine.stop();
    };
  }, [pauseDriverUpdates]);

  const visibleDrivers = useMemo(() => {
    if (userLocation.latitude === 0 && userLocation.longitude === 0) return drivers;
    return drivers.filter((d) =>
      isDriverNearby({ latitude: d.latitude, longitude: d.longitude }, userLocation)
    );
  }, [drivers, userLocation.latitude, userLocation.longitude]);

  const hasValidUser = userLocation.latitude !== 0 && userLocation.longitude !== 0;
  const hasPickup =
    pickup &&
    pickup.latitude !== 0 &&
    pickup.longitude !== 0;
  const hasDropoff =
    dropoff &&
    dropoff.latitude !== 0 &&
    dropoff.longitude !== 0 &&
    dropoff.latitude !== 1;
  const hasRoute = routeCoords.length > 0;

  const initialRegion = useMemo(
    () =>
      hasValidUser && !mapReady
        ? {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: ZOOM_DELTA,
            longitudeDelta: ZOOM_DELTA,
          }
        : ABAKALIKI_REGION,
    [hasValidUser, mapReady, userLocation.latitude, userLocation.longitude]
  );

  const onMapReady = useCallback(() => setMapReady(true), []);

  const routeKey = `${pickup?.latitude ?? 0},${pickup?.longitude ?? 0}-${dropoff?.latitude ?? 0},${dropoff?.longitude ?? 0}`;
  const prevRouteKeyRef = useRef('');
  const prevRouteCoordsLengthRef = useRef(0);
  useEffect(() => {
    const keyChanged = routeKey !== prevRouteKeyRef.current;
    const routeJustLoaded = routeCoords.length > 0 && prevRouteCoordsLengthRef.current === 0;
    if (keyChanged) prevRouteKeyRef.current = routeKey;
    prevRouteCoordsLengthRef.current = routeCoords.length;
    if (keyChanged || routeJustLoaded) routeFittedRef.current = false;
  }, [routeKey, routeCoords.length]);

  // Map only resizes when both pickup and dropoff are set (no resize on pickup-only)

  // When both pickup and dropoff are set, fit map to route and show line
  useEffect(() => {
    if (!hasPickup || !hasDropoff || !mapRef?.current) {
      if (!hasPickup || !hasDropoff) routeFittedRef.current = false;
      return;
    }
    const fittingCoords = [pickup!, dropoff!];
    // Use pin coordinates for fitting; route polyline data can be malformed.
    const hasInvalidPin = fittingCoords.some(
      (c) =>
        Math.abs(c.latitude) < 0.01 && Math.abs(c.longitude) < 0.01
    );
    if (hasInvalidPin) {
      routeFittedRef.current = false;
      return;
    }
    if (routeFittedRef.current) return;
    routeFittedRef.current = true;
    onRouteReady?.(routeCoords.length > 0 ? routeCoords : fittingCoords);
    const map = mapRef.current as any;
    const distanceKm = haversineKm(pickup!, dropoff!);
    if (distanceKm <= MAX_FIT_DISTANCE_KM && map.fitToCoordinates) {
      map.fitToCoordinates(fittingCoords, {
        edgePadding: FIT_EDGE_PADDING,
        animated: true,
      });
    } else if (map.animateToRegion) {
      map.animateToRegion({ latitude: pickup!.latitude, longitude: pickup!.longitude, latitudeDelta: ZOOM_DELTA * 2, longitudeDelta: ZOOM_DELTA * 2 }, 400);
    }
  }, [routeCoords.length, hasPickup, hasDropoff, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, mapRef, onRouteReady]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFillObject} renderToHardwareTextureAndroid>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          onMapReady={onMapReady}
          provider={PROVIDER_GOOGLE}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsPointsOfInterest={true}
          showsBuildings={false}
          customMapStyle={KEKE_MAP_STYLE}
          mapType="standard"
          scrollEnabled
          zoomEnabled
          pitchEnabled={false}
          rotateEnabled={false}
          mapPadding={mapPadding}
          legalLabelInsets={legalLabelInsets}
          clusteringEnabled={true}
          clusterColor="#3C8F7C"
          clusterTextColor="#fff"
          radius={80}
          minPoints={2}
        >
        <UserMarker
          latitude={userLocation.latitude}
          longitude={userLocation.longitude}
          heading={userHeading}
        />
        {showLiveAssignedDriver ? (
          <LiveDriverMarker
            latitude={driverLiveLocation!.lat}
            longitude={driverLiveLocation!.lng}
            heading={driverLiveLocation!.heading}
          />
        ) : null}
        {visibleDrivers.map((d) => (
          <DriverMarker
            key={d.id}
            driver={d}
            coordinate={{ latitude: d.latitude, longitude: d.longitude }}
          />
        ))}
        {hasPickup && (
          <PickupPulseMarker
            coordinate={pickup!}
            etaLabel={etaLabel ?? undefined}
            cluster={false}
          />
        )}
        {hasDropoff && (
          <Marker
            coordinate={dropoff!}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            cluster={false}
          >
            <View style={styles.dropoffWrap}>
              <View style={[styles.pinDot, styles.pinDotDropoff]} />
              {arriveByLabel ? (
                <View style={styles.etaPillArrive}>
                  <Text style={styles.etaPillTextArrive} numberOfLines={1}>
                    {arriveByLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        )}
        {hasRoute && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeWidth={ROUTE_SHADOW_WIDTH}
              strokeColor="rgba(0,0,0,0.1)"
              lineCap="round"
              lineJoin="round"
              geodesic
              zIndex={1}
            />
            <Polyline
              coordinates={routeCoords}
              strokeWidth={ROUTE_STROKE_WIDTH}
              strokeColor={ROUTE_COLOR}
              lineCap="round"
              lineJoin="round"
              geodesic
              zIndex={2}
            />
          </>
        )}
        </MapView>
      </View>
      {routeLoading && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: "center",
              alignItems: "center",
              pointerEvents: "none",
            },
          ]}
        >
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.9)",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <ActivityIndicator size="small" color={ROUTE_COLOR} />
          </View>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  dropoffWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  pinDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  pinDotDropoff: { backgroundColor: "#e74c3c" },
  etaPillArrive: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#5B21B6",
    maxWidth: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  etaPillTextArrive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
});

export const HomeMap = memo(HomeMapComponent);
