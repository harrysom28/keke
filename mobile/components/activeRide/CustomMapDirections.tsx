import React, { useEffect, useState } from 'react';
import { Polyline } from 'react-native-maps';
import { getDirections } from '@/utils/mapsApi';

interface CustomMapDirectionsProps {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  strokeWidth?: number;
  strokeColor?: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
}

/**
 * Custom Map Directions Component
 * Uses backend proxy instead of direct Google Maps API key
 */
export default function CustomMapDirections({
  origin,
  destination,
  strokeWidth = 4,
  strokeColor = '#000000',
  mode = 'driving',
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
          // Decode polyline from Google Directions API
          const encodedPolyline = result.routes[0].overview_polyline?.points;
          if (encodedPolyline) {
            const decoded = decodePolyline(encodedPolyline);
            console.log('CustomMapDirections: Decoded', decoded.length, 'coordinates');
            setCoordinates(decoded);
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
      {/* Shadow/Outline polyline for depth effect */}
      <Polyline
        coordinates={coordinates}
        strokeWidth={strokeWidth + 2}
        strokeColor="rgba(0, 0, 0, 0.15)"
        lineCap="round"
        lineJoin="round"
      />
      {/* Main route polyline */}
      <Polyline
        coordinates={coordinates}
        strokeWidth={strokeWidth}
        strokeColor={strokeColor}
        lineCap="round"
        lineJoin="round"
      />
    </>
  );
}

/**
 * Decode Google's polyline encoding
 */
function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const poly: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return poly;
}

