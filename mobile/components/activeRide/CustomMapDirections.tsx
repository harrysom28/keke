import React, { useEffect, useState } from 'react';
import { Polyline } from 'react-native-maps';
import { getDirections } from '@/utils/mapsApi';
import { decodePolyline } from '@/utils/polylineDecoder';

export type MapDirectionsResult = {
  coordinates: Array<{ latitude: number; longitude: number }>;
  distance?: number;
  duration?: number;
};

interface CustomMapDirectionsProps {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  strokeWidth?: number;
  strokeColor?: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  /** Called when route is fetched and decoded; use to fit map to route */
  onReady?: (result: MapDirectionsResult) => void;
}

/**
 * Custom Map Directions Component
 * Uses backend proxy instead of direct Google Maps API key
 */
// Slimmer line, green to match app brand
const BOLT_ROUTE_STROKE_WIDTH = 4;
const BOLT_ROUTE_COLOR = '#16A34A';

export default function CustomMapDirections({
  origin,
  destination,
  strokeWidth = BOLT_ROUTE_STROKE_WIDTH,
  strokeColor = BOLT_ROUTE_COLOR,
  mode = 'driving',
  onReady,
}: CustomMapDirectionsProps) {
  const [coordinates, setCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRoute = async () => {
      // Validate coordinates - must be valid lat/lng (not 0,0 or 1,1 which are default values)
      if (!origin || !destination) {
        console.log('CustomMapDirections: Missing origin or destination');
        return;
      }

      // Check if coordinates are valid (not default placeholder values)
      const isValidOrigin = origin.latitude !== 0 && origin.longitude !== 0 && 
                           origin.latitude !== 1 && origin.longitude !== 1;
      const isValidDest = destination.latitude !== 0 && destination.longitude !== 0 && 
                         destination.latitude !== 1 && destination.longitude !== 1;

      if (!isValidOrigin || !isValidDest) {
        console.log('CustomMapDirections: Invalid coordinates', { origin, destination });
        setCoordinates([]);
        return;
      }

      // Validate lat/lng ranges
      if (Math.abs(origin.latitude) > 90 || Math.abs(origin.longitude) > 180 ||
          Math.abs(destination.latitude) > 90 || Math.abs(destination.longitude) > 180) {
        console.log('CustomMapDirections: Coordinates out of valid range', { origin, destination });
        setCoordinates([]);
        return;
      }

      try {
        setLoading(true);
        const originStr = `${origin.latitude},${origin.longitude}`;
        const destStr = `${destination.latitude},${destination.longitude}`;

        console.log('CustomMapDirections: Fetching route from', originStr, 'to', destStr);
        const result = await getDirections(originStr, destStr, mode);

        if (result && result.routes && result.routes.length > 0) {
          const route = result.routes[0];
          const encodedPolyline = route.overview_polyline?.points;
          if (encodedPolyline) {
            const decoded = decodePolyline(encodedPolyline);
            console.log('CustomMapDirections: Decoded', decoded.length, 'coordinates');
            setCoordinates(decoded);
            const distance = route.legs?.[0]?.distance?.value;
            const duration = route.legs?.[0]?.duration?.value;
            onReady?.({ coordinates: decoded, distance, duration });
          } else {
            console.warn('CustomMapDirections: No polyline in route result');
            setCoordinates([]);
          }
        } else {
          console.warn('CustomMapDirections: No routes returned from API');
          setCoordinates([]);
        }
      } catch (error: any) {
        console.error('CustomMapDirections: Error fetching directions:', error?.response?.data || error?.message);
        setCoordinates([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRoute();
  }, [origin.latitude, origin.longitude, destination.latitude, destination.longitude, mode]);

  // Debug: Log when component renders
  useEffect(() => {
    if (coordinates.length > 0) {
      console.log('CustomMapDirections: Rendering polyline with', coordinates.length, 'points');
    }
  }, [coordinates.length]);

  if (!coordinates.length) {
    return null;
  }

  return (
    <>
      {/* Subtle shadow for depth */}
      <Polyline
        coordinates={coordinates}
        strokeWidth={strokeWidth + 1}
        strokeColor="rgba(0, 0, 0, 0.1)"
        lineCap="round"
        lineJoin="round"
        zIndex={1}
      />
      {/* Main route – slimmer line */}
      <Polyline
        coordinates={coordinates}
        strokeWidth={strokeWidth}
        strokeColor={strokeColor}
        lineCap="round"
        lineJoin="round"
        zIndex={2}
      />
    </>
  );
}


