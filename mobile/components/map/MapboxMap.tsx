/**
 * Mapbox Map Component – cost-efficient mapping (OpenStreetMap data)
 * Replaces Google Maps SDK. Use when MAPBOX_ACCESS_TOKEN is configured.
 *
 * Features: smooth pan/zoom, fast tiles, minimal memory, polyline from OSRM geometry.
 * Ref: animateToRegion(region, duration?), fitToCoordinates(coords, opts?)
 *
 * Setup: app.config.js extra.MAPBOX_ACCESS_TOKEN + npx expo prebuild
 * @see docs/MAPPING_MIGRATION.md
 */

import React, { useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

const MAPBOX_STYLE_URL = 'mapbox://styles/mapbox/streets-v11';

export function getMapboxToken(): string | null {
  try {
    const c = require('expo-constants').default;
    const extra = c.expoConfig?.extra ?? (global as any).expo?.extra;
    const token =
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ??
      extra?.MAPBOX_ACCESS_TOKEN ??
      (global as any).expo?.extra?.MAPBOX_ACCESS_TOKEN;
    return token && typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

const HAS_MAPBOX = Boolean(getMapboxToken());

export interface MapboxMapProps {
  style?: object;
  centerCoordinate?: [number, number];
  zoomLevel?: number;
  onMapReady?: () => void;
  children?: React.ReactNode;
  /** Initial region (for fallback or non-Mapbox) */
  region?: { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number };
  /** Route polyline coords from OSRM (array of {latitude, longitude}) */
  routeCoords?: Array<{ latitude: number; longitude: number }>;
  /** Pickup marker */
  pickup?: { latitude: number; longitude: number };
  /** Destination marker */
  destination?: { latitude: number; longitude: number };
  /** User/driver current location */
  userLocation?: { latitude: number; longitude: number };
  /** Additional markers (e.g. nearby drivers) */
  markers?: Array<{ id: string; latitude: number; longitude: number; icon?: React.ReactNode }>;
  /** Callback when map is ready (e.g. fit to route) */
  onMapLoaded?: () => void;
}

export interface MapboxMapRef {
  animateToRegion: (region: { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number }, duration?: number) => void;
  fitToCoordinates: (coords: Array<{ latitude: number; longitude: number }>, opts?: { edgePadding?: { top?: number; right?: number; bottom?: number; left?: number }; animated?: boolean }) => void;
}

const DEFAULT_CENTER: [number, number] = [8.6753, 9.082];
const DEFAULT_ZOOM = 14;
const ROUTE_COLOR = '#3C8F7C';
const ROUTE_LINE_WIDTH = 5;

function FallbackMap({ style, onMapReady, children }: MapboxMapProps) {
  return (
    <View style={[styles.fallback, style]} onLayout={() => onMapReady?.()}>
      {children}
    </View>
  );
}

function regionToZoom(latitudeDelta: number): number {
  if (!latitudeDelta || latitudeDelta <= 0) return DEFAULT_ZOOM;
  return Math.min(21, Math.max(8, Math.round(Math.log(360 / latitudeDelta) / Math.LN2)));
}

export const MapboxMap = forwardRef<MapboxMapRef, MapboxMapProps>(function MapboxMap({
  style,
  centerCoordinate,
  zoomLevel = DEFAULT_ZOOM,
  onMapReady,
  children,
  region,
  routeCoords = [],
  pickup,
  destination,
  userLocation,
  markers = [],
  onMapLoaded,
}, ref) {
  const cameraRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion(reg, duration = 500) {
      const cam = cameraRef.current;
      if (!cam?.setCamera) return;
      const zoom = reg.latitudeDelta != null ? regionToZoom(reg.latitudeDelta) : zoomLevel;
      cam.setCamera({
        centerCoordinate: [reg.longitude, reg.latitude],
        zoomLevel: zoom,
        animationDuration: duration,
      });
    },
    fitToCoordinates(coords, opts = {}) {
      const cam = cameraRef.current;
      if (!cam?.setCamera || !coords?.length) return;
      const padding = opts.edgePadding ?? { top: 100, right: 60, bottom: 200, left: 60 };
      let minLat = coords[0].latitude, maxLat = minLat, minLng = coords[0].longitude, maxLng = minLng;
      coords.forEach((c) => {
        minLat = Math.min(minLat, c.latitude); maxLat = Math.max(maxLat, c.latitude);
        minLng = Math.min(minLng, c.longitude); maxLng = Math.max(maxLng, c.longitude);
      });
      const pad = (padding.top ?? 0) + (padding.bottom ?? 0);
      const ne: [number, number] = [maxLng, maxLat];
      const sw: [number, number] = [minLng, minLat];
      cam.setCamera({
        bounds: { ne, sw },
        padding: { paddingTop: padding.top ?? 0, paddingBottom: padding.bottom ?? 0, paddingLeft: padding.left ?? 0, paddingRight: padding.right ?? 0 },
        animationDuration: opts.animated !== false ? 400 : 0,
      });
    },
  }), [zoomLevel]);

  const center = useMemo((): [number, number] => {
    if (centerCoordinate && centerCoordinate.length >= 2) return centerCoordinate;
    if (region) return [region.longitude, region.latitude];
    if (userLocation) return [userLocation.longitude, userLocation.latitude];
    return DEFAULT_CENTER;
  }, [centerCoordinate, region, userLocation]);

  if (!HAS_MAPBOX) {
    return <FallbackMap style={style} onMapReady={onMapReady} children={children} />;
  }

  let MapView: any;
  let Camera: any;
  let PointAnnotation: any;
  let ShapeSource: any;
  let LineLayer: any;
  try {
    const MapboxGL = require('@rnmapbox/maps').default;
    MapView = MapboxGL.MapView ?? MapboxGL;
    Camera = MapboxGL.Camera;
    PointAnnotation = MapboxGL.PointAnnotation;
    ShapeSource = MapboxGL.ShapeSource;
    LineLayer = MapboxGL.LineLayer;
    if (!MapView || !Camera) return <FallbackMap style={style} onMapReady={onMapReady} children={children} />;
  } catch {
    return <FallbackMap style={style} onMapReady={onMapReady} children={children} />;
  }

  const lineCoordinates = useMemo(() => {
    if (!routeCoords.length) return [];
    return routeCoords.map((c) => [c.longitude, c.latitude] as [number, number]);
  }, [routeCoords]);

  const lineGeoJSON = useMemo(() => {
    if (lineCoordinates.length < 2) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: lineCoordinates,
      },
    };
  }, [lineCoordinates]);

  const onMapReadyInternal = useCallback(() => {
    onMapReady?.();
    onMapLoaded?.();
  }, [onMapReady, onMapLoaded]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={MAPBOX_STYLE_URL}
        onMapReady={onMapReadyInternal}
        scaleBarEnabled={false}
        compassEnabled={false}
        attributionEnabled={Platform.OS === 'android'}
        logoEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel }}
          centerCoordinate={center}
          zoomLevel={zoomLevel}
          animationMode="flyTo"
          animationDuration={300}
        />
        {lineGeoJSON && (
          <ShapeSource id="routeSource" shape={lineGeoJSON}>
            <LineLayer
              id="routeLine"
              style={{
                lineColor: ROUTE_COLOR,
                lineWidth: ROUTE_LINE_WIDTH,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}
        {pickup && (
          <PointAnnotation id="pickup" coordinate={[pickup.longitude, pickup.latitude]} anchor={{ x: 0.5, y: 1 }}>
            <View style={[styles.marker, styles.pickupMarker]} />
          </PointAnnotation>
        )}
        {destination && (
          <PointAnnotation id="destination" coordinate={[destination.longitude, destination.latitude]} anchor={{ x: 0.5, y: 1 }}>
            <View style={[styles.marker, styles.destMarker]} />
          </PointAnnotation>
        )}
        {userLocation && (
          <PointAnnotation id="user" coordinate={[userLocation.longitude, userLocation.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.marker, styles.userMarker]} />
          </PointAnnotation>
        )}
        {markers.map((m) => (
          <PointAnnotation key={m.id} id={m.id} coordinate={[m.longitude, m.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
            {m.icon ?? <View style={[styles.marker, styles.genericMarker]} />}
          </PointAnnotation>
        ))}
        {children}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, backgroundColor: '#e8e8e8' },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  pickupMarker: { backgroundColor: '#3C8F7C' },
  destMarker: { backgroundColor: '#e74c3c' },
  userMarker: { backgroundColor: '#3498db', width: 16, height: 16, borderRadius: 8 },
  genericMarker: { backgroundColor: '#95a5a6' },
});

export default MapboxMap;
