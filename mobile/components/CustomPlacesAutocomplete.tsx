import React, { useState, useEffect, useRef } from 'react';
import { TextInput, TouchableOpacity, View, Text, ActivityIndicator } from 'react-native';
import { searchPlaces, getPlaceDetails, PlacePrediction } from '@/utils/placesApi';

interface CustomPlacesAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (place: {
    place_id: string;
    name: string;
    formatted_address: string;
    lat: number;
    long: number;
  }) => void;
  onClear?: () => void;
  onFocus?: () => void;
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
export default function CustomPlacesAutocomplete({
  placeholder = 'Search',
  onPlaceSelected,
  onClear,
  onFocus,
  autoFocus = false,
  initialValue = '',
  showClearButton = true,
  styles,
}: CustomPlacesAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const isSelectingPlaceRef = useRef(false);
  const isInitialMount = useRef(true);
  const lastInitialValue = useRef(initialValue);
  const forceUpdateRef = useRef(0);
  const rateLimitCooldownRef = useRef<number>(0); // Timestamp for rate limit cooldown

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
      isSelectingPlaceRef.current = false;
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search - increased delay to prevent rate limiting
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
      }, 500); // Increased from 300ms to 500ms
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
    if (input.length < 3) {
      setPredictions([]);
      setShowResults(false);
      return;
    }
    
    try {
      setLoading(true);
      setShowResults(true);
      // No types parameter = searches everything (addresses, businesses, landmarks, etc.)
      const results = await searchPlaces(input);
      
      if (__DEV__) {
        console.log('📋 CustomPlacesAutocomplete received', results?.length || 0, 'results');
        if (results && results.length > 0) {
          console.log('📋 Sample result:', results[0]);
        }
      }
      
      setPredictions(results || []);
      
      if (results && results.length > 0) {
        setShowResults(true);
      } else {
        setShowResults(false);
      }
      
      // Clear rate limit cooldown on successful request
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
    try {
      // Set flag immediately to prevent blur from hiding results
      isSelectingPlaceRef.current = true;
      setLoading(true);
      setShowResults(false);
      
      // Immediately update the query field with the prediction's description
      // This provides instant feedback while we fetch full details
      const displayText = prediction.structured_formatting?.main_text || prediction.description;
      setQuery(displayText);
      setPredictions([]);
      
      if (__DEV__) {
        console.log('🎯 Selected prediction:', displayText);
      }
      
      const details = await getPlaceDetails(prediction.place_id);
      
      if (__DEV__) {
        console.log('📍 Place details received:', {
          place_id: details?.place_id,
          name: details?.name,
          formatted_address: details?.formatted_address,
          hasGeometry: !!details?.geometry,
        });
      }
      
      if (details) {
        // Use the full name or formatted address from details if available
        const finalDisplayText = details.name || details.formatted_address || displayText;
        
        if (__DEV__) {
          console.log('✅ Setting final display text:', finalDisplayText);
        }
        
        // Update lastInitialValue FIRST to prevent sync from overwriting
        lastInitialValue.current = finalDisplayText;
        
        // Set query immediately for visual feedback
        setQuery(finalDisplayText);
        forceUpdateRef.current += 1; // Force re-render
        
        // Call the parent callback - use finalDisplayText as name so parent passes same value back
        onPlaceSelected({
          place_id: details.place_id,
          name: finalDisplayText, // Use the exact display text we're showing
          formatted_address: details.formatted_address || prediction.description,
          lat: details.geometry.location.lat,
          long: details.geometry.location.lng,
        });
      } else {
        // If details fetch fails, still use the prediction data
        console.warn('⚠️  Place details not available, using prediction data');
        // Update lastInitialValue FIRST to prevent sync from overwriting
        lastInitialValue.current = displayText;
        setQuery(displayText);
        forceUpdateRef.current += 1;
        // Still call onPlaceSelected with prediction data
        onPlaceSelected({
          place_id: prediction.place_id,
          name: prediction.structured_formatting?.main_text || prediction.description,
          formatted_address: prediction.description,
          lat: 0,
          long: 0,
        });
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      // On error, still try to use prediction data
      const displayText = prediction.structured_formatting?.main_text || prediction.description;
      // Update lastInitialValue FIRST to prevent sync from overwriting
      lastInitialValue.current = displayText;
      setQuery(displayText);
      forceUpdateRef.current += 1;
      onPlaceSelected({
        place_id: prediction.place_id,
        name: prediction.structured_formatting?.main_text || prediction.description,
        formatted_address: prediction.description,
        lat: 0,
        long: 0,
      });
    } finally {
      setLoading(false);
      // Keep the flag set longer to prevent sync from overwriting
      // The sync effect will clear it when it runs
      setTimeout(() => {
        isSelectingPlaceRef.current = false;
      }, 300);
    }
  };

  const handleClear = () => {
    setQuery('');
    lastInitialValue.current = '';
    setPredictions([]);
    setShowResults(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <View style={{ position: 'relative', zIndex: 50 }}>
      <View style={{ position: 'relative' }}>
        <TextInput
          key={`input-${forceUpdateRef.current}`}
          value={query !== undefined && query !== null ? query : (initialValue || '')}
          onChangeText={(text) => {
            setQuery(text);
            // Clear selection flag when user types
            isSelectingPlaceRef.current = false;
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
          onFocus={() => {
            // Only show results if there are predictions and user is actively searching
            // Don't show on initial focus if query matches initialValue (programmatically set)
            const shouldShowResults = predictions.length > 0 && !isSelectingPlaceRef.current;
            if (shouldShowResults) {
              setShowResults(true);
            }
            if (onFocus) {
              onFocus();
            }
          }}
          onBlur={() => {
            // Hide results when field loses focus - increased timeout for tap handling
            setTimeout(() => {
              if (!loading && !isSelectingPlaceRef.current) {
                setShowResults(false);
              }
            }, 500);
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

      {showResults && predictions.length > 0 && (
        <View
          style={{
            maxHeight: 200,
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
          {predictions.map((item, index) => (
            <TouchableOpacity
              key={item.place_id || `prediction-${index}`}
              onPressIn={() => {
                // Prevent blur from hiding results when tapping
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
                {item.structured_formatting?.main_text || item.description}
              </Text>
              {item.structured_formatting?.secondary_text && (
                <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {item.structured_formatting.secondary_text}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

