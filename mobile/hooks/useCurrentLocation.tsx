import * as Location from "expo-location";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCurrentLocation({ isFocused }: { isFocused: boolean }) {
  const [location, setLocation] = useState<Location.LocationObjectCoords>({
    latitude: 0,
    longitude: 0,
    altitude: 0,
    accuracy: 0,
    altitudeAccuracy: 0,
    heading: 0,
    speed: 0,
  });

  const [locationError, setLocationError] = useState("");
  const [address, setAddress] = useState<Location.LocationGeocodedAddress>({
    city: "",
    district: "",
    streetNumber: "",
    street: "",
    region: "",
    subregion: "",
    country: "",
    postalCode: "",
    name: "",
    isoCountryCode: "",
    timezone: "",
    formattedAddress: "",
  });

  const [loading, setLoading] = useState(true);
  const bestAccuracyRef = useRef<number>(Infinity); // Track best accuracy received (use ref for closure)

  const getLocation = useCallback(async () => {
    console.log("📍 Starting location watch");

    try {
      setLoading(true);
      setLocationError("");

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Permission to access location was denied");
        setLoading(false);
        return;
      }

      // Get current location immediately for better initial accuracy
      // Try multiple times with increasing timeout to get GPS lock
      let bestLocation: Location.LocationObject | null = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && (!bestLocation || (bestLocation.coords.accuracy || Infinity) > 50)) {
        try {
          const currentLocation = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.BestForNavigation, // Highest accuracy - prioritizes GPS
              maximumAge: attempts === 0 ? 5000 : 0, // First attempt can use cached, others need fresh
              timeout: 10000, // 10 second timeout per attempt
            }),
            new Promise<Location.LocationObject>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 10000)
            ),
          ]);
          
          const accuracy = currentLocation.coords.accuracy || Infinity;
          
          console.log(`📍 Location attempt ${attempts + 1}:`, {
            lat: currentLocation.coords.latitude,
            lng: currentLocation.coords.longitude,
            accuracy: `${accuracy.toFixed(0)}m`,
            altitude: currentLocation.coords.altitude,
          });
          
          // Keep the most accurate location
          if (!bestLocation || accuracy < (bestLocation.coords.accuracy || Infinity)) {
            bestLocation = currentLocation;
            bestAccuracyRef.current = accuracy;
          }
          
          // If we got excellent accuracy (< 20m), use it immediately
          if (accuracy < 20) {
            console.log("✅ Excellent GPS accuracy, using immediately");
            break;
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            // Wait a bit before next attempt to let GPS lock improve
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (getCurrentError: any) {
          console.warn(`⚠️ Location attempt ${attempts + 1} failed:`, getCurrentError?.message || getCurrentError);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (bestLocation) {
        const accuracy = bestLocation.coords.accuracy || 0;
        console.log("📍 Using best location:", {
          lat: bestLocation.coords.latitude,
          lng: bestLocation.coords.longitude,
          accuracy: `${accuracy.toFixed(0)}m`,
          source: accuracy < 20 ? "GPS (excellent)" : accuracy < 50 ? "GPS (good)" : "Network/GPS",
        });
        
        setLocation(bestLocation.coords);
        
        // Reverse geocode immediately
        try {
          const [address] = await Location.reverseGeocodeAsync({
            latitude: bestLocation.coords.latitude,
            longitude: bestLocation.coords.longitude,
          });
          setAddress(address);
        } catch (geocodeError) {
          console.warn("⚠️ Initial geocoding failed:", geocodeError);
        }
      } else {
        console.warn("⚠️ Could not get immediate location, will use watch");
      }

      // Start watching position with high accuracy
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation, // Highest accuracy - prioritizes GPS
          timeInterval: 10000, // Fetch every 10 seconds (reduced from 3s to prevent rate limiting)
          distanceInterval: 10, // Update when device moves 10 meters (reduced sensitivity)
        },
        async (locationResult) => {
          const accuracy = locationResult.coords.accuracy || Infinity;
          const currentBest = bestAccuracyRef.current;
          
          // Determine location source based on accuracy
          const locationSource = 
            accuracy < 10 ? "GPS (excellent)" :
            accuracy < 20 ? "GPS (very good)" :
            accuracy < 50 ? "GPS (good)" :
            accuracy < 100 ? "GPS/Network (fair)" :
            "Network (poor)";
          
          console.log("📍 Location update received:", {
            lat: locationResult.coords.latitude,
            lng: locationResult.coords.longitude,
            accuracy: `${accuracy.toFixed(0)}m`,
            altitude: locationResult.coords.altitude,
            source: locationSource,
            currentBest: currentBest === Infinity ? "none" : `${currentBest.toFixed(0)}m`,
          });
          
          // Only update if:
          // 1. Accuracy is reasonable (< 100m), OR
          // 2. This location is significantly better than current (at least 20% improvement), OR
          // 3. Current location has no accuracy data
          const shouldUpdate = 
            accuracy < 100 && (
              currentBest === Infinity || // No location yet
              accuracy < currentBest || // Better accuracy
              (currentBest > 50 && accuracy < currentBest * 0.8) // Significant improvement for poor locations
            );
          
          if (shouldUpdate) {
            const improvement = currentBest === Infinity 
              ? "initial" 
              : accuracy < currentBest 
                ? `improved by ${(currentBest - accuracy).toFixed(0)}m`
                : "same";
            
            console.log(`✅ Using location (${improvement}):`, {
              accuracy: `${accuracy.toFixed(0)}m`,
              source: locationSource,
            });
            
            setLocation(locationResult.coords);
            bestAccuracyRef.current = accuracy;

            // Reverse geocode to get address information
            const { latitude, longitude } = locationResult.coords;
            try {
              const [address] = await Location.reverseGeocodeAsync({
                latitude,
                longitude,
              });
              setAddress(address);
            } catch (geocodeError) {
              console.warn("⚠️ Geocoding failed:", geocodeError);
            }
          } else {
            if (accuracy >= 100) {
              console.warn(`⚠️ Location accuracy too low (${accuracy.toFixed(0)}m), skipping update`);
            } else {
              console.log(`ℹ️ Location not better than current (${accuracy.toFixed(0)}m vs ${currentBest.toFixed(0)}m), keeping current`);
            }
          }
        }
      );

      // Return the subscription's cleanup function
      return subscription.remove;
    } catch (err) {
      setLocationError("Failed to start location watch");
      console.error("❌ Location error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Automatically start location tracking on mount
  useEffect(() => {
    if (isFocused) {
      // Reset best accuracy when starting fresh
      bestAccuracyRef.current = Infinity;
      
      let cleanup: (() => void) | undefined;
      (async () => {
        cleanup = await getLocation(); // Wait for getLocation to complete
      })();

      // Cleanup function to stop watching location on unmount
      return () => {
        if (cleanup) {
          cleanup();
          console.log("📍 Location watch stopped");
        }
        bestAccuracyRef.current = Infinity;
      };
    }
  }, [getLocation, isFocused]);

  return { location, address, locationError, loading, getLocation };
}
