import React, { useState, useEffect, useRef } from 'react';
import { TextInput, View, Text, ActivityIndicator, Keyboard, Platform } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { searchPlaces, searchPlacesWithLocation, getPlaceDetails, PlacePrediction } from '@/utils/placesApi';
import apiClient from '@/utils/apiClient';

interface QuickPickPlace {
  placeId: string;
  name: string;
  category?: string;
  location: { lat: number; lng: number };
  distanceM?: number;
  source?: string;
}

interface CustomPlacesAutocompleteProps {
  placeholder?: string;
  /** When set, uses Uber-level backend search (re-ranked by distance) and shows "X km away" */
  userLat?: number;
  userLng?: number;
  onPlaceSelected: (place: {
    place_id: string;
    name: string;
    formatted_address: string;
    lat: number;
    long: number;
  }) => void;
  onClear?: () => void;
  onFocus?: () => void;
  /** When true, generates a session token on focus and passes it to search/details for cost-efficient billing */
  useSessionToken?: boolean;
  autoFocus?: boolean;
  initialValue?: string;
  showClearButton?: boolean;
  styles?: {
    textInput?: any;
  };
}

/**
 * Custom Places Autocomplete Component
 * Uses backend proxy instead of direct Google Places API key
 */
function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export default function CustomPlacesAutocomplete({
  placeholder = 'Search',
  userLat,
  userLng,
  onPlaceSelected,
  onClear,
  onFocus,
  useSessionToken = true,
  autoFocus = false,
  initialValue = '',
  showClearButton = true,
  styles,
}: CustomPlacesAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  /** When true, list is hidden after user selected a place; reset on focus or typing so suggestions can show again */
  const [listClosedBySelection, setListClosedBySelection] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);
  const isSelectingPlaceRef = useRef(false);
  const isInitialMount = useRef(true);
  const lastInitialValue = useRef(initialValue);
  const forceUpdateRef = useRef(0);
  const rateLimitCooldownRef = useRef<number>(0);
  const sessionTokenRef = useRef<string | null>(null);
  const [quickPicks, setQuickPicks] = useState<QuickPickPlace[]>([]);

  // Update query when initialValue changes externally (e.g., from parent component)
  useEffect(() => {
    // Don't sync if we're in the middle of selecting a place
    if (isSelectingPlaceRef.current) {
      if (__DEV__) {
        console.log('⏸️ Skipping sync - place selection in progress');
      }
      return;
    }
    
    // Always sync if initialValue changed
    const hasChanged = initialValue !== lastInitialValue.current;
    const isFirstMountWithValue = isInitialMount.current && initialValue;
    
    if (hasChanged || isFirstMountWithValue) {
      if (__DEV__) {
        console.log('🔄 Syncing with new initialValue:', initialValue, 'from:', lastInitialValue.current, 'hasChanged:', hasChanged, 'isMount:', isInitialMount.current, 'currentQuery:', query);
      }
      const newValue = initialValue || '';
      lastInitialValue.current = newValue;
      isSelectingPlaceRef.current = true; // Prevent search trigger
      
      // Force update query state - use functional update to ensure it happens
      setQuery(() => {
        if (__DEV__) {
          console.log('✅ Setting query state to:', newValue);
        }
        return newValue;
      });
      setPredictions([]);
      setShowResults(false);
      forceUpdateRef.current += 1; // Force re-render
      
      // Clear the flag after a short delay
      setTimeout(() => {
        isSelectingPlaceRef.current = false;
      }, 50);
      
      if (isInitialMount.current) {
        isInitialMount.current = false;
      }
    }
  }, [initialValue]);

  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Skip search if we're programmatically setting query after place selection
    if (isSelectingPlaceRef.current) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search (350ms — map-efficient, reduces API calls)
    if (query.length > 2) {
      // Check if we're in rate limit cooldown
      const now = Date.now();
      if (rateLimitCooldownRef.current > now) {
        const remainingTime = Math.ceil((rateLimitCooldownRef.current - now) / 1000);
        if (__DEV__) {
          console.log(`⏳ Rate limit cooldown active. Waiting ${remainingTime}s...`);
        }
        return;
      }

      debounceRef.current = setTimeout(() => {
        handleSearch(query);
      }, 350);
    } else {
      setPredictions([]);
      setShowResults(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSearch = async (input: string) => {
    if (input.length < 2) {
      setPredictions([]);
      setShowResults(false);
      return;
    }
    
    try {
      setLoading(true);
      setShowResults(true);
      const hasLocation = typeof userLat === 'number' && typeof userLng === 'number' && !Number.isNaN(userLat) && !Number.isNaN(userLng);
      const sessionToken = useSessionToken ? sessionTokenRef.current ?? undefined : undefined;
      const results = hasLocation
        ? await searchPlacesWithLocation(input, userLat, userLng, sessionToken)
        : await searchPlaces(input);
      
      if (__DEV__) {
        console.log('📋 CustomPlacesAutocomplete received', results?.length || 0, 'results', hasLocation ? '(Uber-level)' : '');
        if (results && results.length > 0) {
          console.log('📋 Sample result:', results[0]);
        }
      }
      
      if (isSelectingPlaceRef.current) return; // User selected a place while this request was in flight
      setPredictions(results || []);
      
      if (results && results.length > 0) {
        setShowResults(true);
      } else {
        setShowResults(false);
      }
      
      rateLimitCooldownRef.current = 0;
    } catch (error: any) {
      // Handle rate limit errors - set cooldown period
      if (error?.response?.status === 429) {
        const cooldownDuration = 5000; // 5 seconds cooldown
        rateLimitCooldownRef.current = Date.now() + cooldownDuration;
        if (__DEV__) {
          console.warn(`⚠️  Rate limit (429) - cooldown set for ${cooldownDuration / 1000}s`);
        }
        setPredictions([]);
        setShowResults(false);
        return;
      }
      
      console.error('❌ Search error:', error?.message || error);
      if (error?.response?.status === 307 || error?.response?.data?.includes?.('sucuri')) {
        console.error('⚠️  SUCRI DETECTED - App may be using production URL!');
        console.error('   Check console logs above for actual API URL being used.');
        console.error('   Solution: Fully reload app (shake device → Reload, or restart Metro)');
      }
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    // Mark selecting immediately so the query effect does not run a new search when we setQuery below
    isSelectingPlaceRef.current = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    setShowResults(false);
    setPredictions([]);
    setListClosedBySelection(true);
    if (Platform.OS === 'ios') {
      Keyboard.dismiss();
      inputRef.current?.blur();
    } else {
      setTimeout(() => {
        Keyboard.dismiss();
        inputRef.current?.blur();
      }, 50);
    }
    const shortText = prediction.structured_formatting?.main_text || prediction.name;
    const fullDisplayText =
      prediction.structured_formatting?.main_text ||
      prediction.name ||
      shortText ||
      prediction.formatted_address ||
      prediction.description;
    try {
      setLoading(true);

      const hasCoords = typeof prediction.lat === 'number' && typeof prediction.long === 'number' && !Number.isNaN(prediction.lat) && !Number.isNaN(prediction.long);
      if (hasCoords) {
        const finalDisplayText = fullDisplayText || shortText || '';
        lastInitialValue.current = finalDisplayText;
        setQuery(finalDisplayText);
        forceUpdateRef.current += 1;
        onPlaceSelected({
          place_id: prediction.place_id,
          name: finalDisplayText,
          formatted_address: prediction.formatted_address || prediction.description || '',
          lat: prediction.lat ?? 0,
          long: prediction.long ?? 0,
        });
        setLoading(false);
        setTimeout(() => { isSelectingPlaceRef.current = false; }, 300);
        return;
      }

      const details = await getPlaceDetails(
        prediction.place_id,
        useSessionToken ? sessionTokenRef.current ?? undefined : undefined
      );
      if (useSessionToken) sessionTokenRef.current = null;
      const fromDetails = details?.name || details?.formatted_address;
      const finalDisplayText = fromDetails || fullDisplayText || shortText || '';
      lastInitialValue.current = finalDisplayText;
      setQuery(finalDisplayText);
      forceUpdateRef.current += 1;
      if (details?.geometry?.location) {
        // Backend sometimes returns lat/lng as empty strings; coerce to numbers for consistency.
        const rawLat = (details.geometry.location as any).lat;
        const rawLng = (details.geometry.location as any).lng;
        const latNum = Number(rawLat);
        const lngNum = Number(rawLng);
        const safeLat = Number.isFinite(latNum) ? latNum : 0;
        const safeLng = Number.isFinite(lngNum) ? lngNum : 0;
        onPlaceSelected({
          place_id: details.place_id,
          name: finalDisplayText,
          formatted_address: details.formatted_address || prediction.description,
          lat: safeLat,
          long: safeLng,
        });
      } else {
        onPlaceSelected({
          place_id: prediction.place_id,
          name: finalDisplayText,
          formatted_address: prediction.formatted_address || prediction.description || '',
          lat: 0,
          long: 0,
        });
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      const fallbackText = fullDisplayText || shortText || '';
      lastInitialValue.current = fallbackText;
      setQuery(fallbackText);
      forceUpdateRef.current += 1;
      onPlaceSelected({
        place_id: prediction.place_id,
        name: fallbackText,
        formatted_address: prediction.formatted_address || prediction.description || '',
        lat: 0,
        long: 0,
      });
    } finally {
      setLoading(false);
      setTimeout(() => { isSelectingPlaceRef.current = false; }, 300);
    }
  };

  const handleClear = () => {
    setQuery('');
    lastInitialValue.current = '';
    setPredictions([]);
    setShowResults(false);
    setListClosedBySelection(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <View style={{ position: 'relative', zIndex: 50 }}>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={inputRef}
          key={`input-${forceUpdateRef.current}`}
          value={query !== undefined && query !== null ? query : (initialValue || '')}
          onChangeText={(text) => {
            setQuery(text);
            isSelectingPlaceRef.current = false;
            setListClosedBySelection(false);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={[
            {
              borderWidth: 1,
              borderColor: '#3C8F7C',
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: '#3C8F7C63',
              borderRadius: 8,
            },
            styles?.textInput,
          ]}
          onFocus={async () => {
            setListClosedBySelection(false);
            if (useSessionToken && !sessionTokenRef.current) {
              sessionTokenRef.current = newSessionToken();
            }
            const hasLocation =
              typeof userLat === 'number' &&
              typeof userLng === 'number' &&
              !Number.isNaN(userLat) &&
              !Number.isNaN(userLng) &&
              !(userLat === 0 && userLng === 0);
            if (hasLocation && quickPicks.length === 0) {
              try {
                const res = await apiClient.get('maps/places/nearby', {
                  params: { lat: userLat, lng: userLng },
                });
                const data = res?.data?.data ?? res?.data;
                const places = data?.places ?? data?.pois ?? [];
                setQuickPicks(Array.isArray(places) ? places : []);
              } catch {
                setQuickPicks([]);
              }
            }
            const shouldShowResults = (predictions.length > 0 || quickPicks.length > 0) && !isSelectingPlaceRef.current;
            if (shouldShowResults) {
              setShowResults(true);
            }
            if (onFocus) {
              onFocus();
            }
          }}
          onBlur={() => {
            if (isSelectingPlaceRef.current) return;
            setTimeout(() => {
              if (!isSelectingPlaceRef.current) {
                setShowResults(false);
              }
            }, Platform.OS === 'android' ? 200 : 100);
          }}
        />
        
        {loading && (
          <View style={{ position: 'absolute', right: 12, top: 12 }}>
            <ActivityIndicator size="small" color="#3C8F7C" />
          </View>
        )}
        
        {query.length > 0 && !loading && showClearButton && (
          <TouchableOpacity
            onPress={handleClear}
            style={{ position: 'absolute', right: 12, top: 12 }}
          >
            <Text style={{ fontSize: 18, color: '#414141' }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {showResults && !listClosedBySelection && (predictions.length > 0 || (query.length === 0 && quickPicks.length > 0)) && (
        <View
          style={{
            maxHeight: 280,
            backgroundColor: 'white',
            borderRadius: 8,
            marginTop: 4,
            elevation: 3,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            overflow: 'hidden',
          }}
        >
          {query.length === 0 && quickPicks.length > 0 && (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>
                Popular nearby
              </Text>
              {quickPicks.map((place) => (
                <TouchableOpacity
                  key={place.placeId}
                  onPressIn={() => { isSelectingPlaceRef.current = true; }}
                  onPress={() => {
                    setShowResults(false);
                    setPredictions([]);
                    setListClosedBySelection(true);
                    setQuery(place.name);
                    Keyboard.dismiss();
                    inputRef.current?.blur();
                    onPlaceSelected({
                      place_id: place.placeId,
                      name: place.name,
                      formatted_address: place.category ? `${place.category} · ${place.distanceM != null ? `${place.distanceM} m away` : ''}` : '',
                      lat: place.location?.lat ?? 0,
                      long: place.location?.lng ?? 0,
                    });
                    setTimeout(() => { isSelectingPlaceRef.current = false; }, 300);
                  }}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }} numberOfLines={1}>{place.name}</Text>
                  {place.distanceM != null && (
                    <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {place.distanceM < 1000 ? `${place.distanceM} m away` : `${(place.distanceM / 1000).toFixed(1)} km away`}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {predictions.length > 0 && predictions.map((item, index) => (
            <TouchableOpacity
              key={item.place_id || `prediction-${index}`}
              onPressIn={() => {
                isSelectingPlaceRef.current = true;
              }}
              onPress={() => {
                handleSelectPlace(item);
              }}
              activeOpacity={0.7}
              style={{
                padding: 12,
                borderBottomWidth: index < predictions.length - 1 ? 1 : 0,
                borderBottomColor: '#f0f0f0',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '500' }}>
                {item.structured_formatting?.main_text || item.name || item.description}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                {item.distanceAwayLabel ? (
                  <Text style={{ fontSize: 12, color: '#3C8F7C', marginRight: 6 }}>
                    {item.distanceAwayLabel}
                  </Text>
                ) : null}
                {(item.structured_formatting?.secondary_text || item.formatted_address) ? (
                  <Text style={{ fontSize: 12, color: '#666', flex: 1 }}>
                    {item.structured_formatting?.secondary_text || item.formatted_address}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

