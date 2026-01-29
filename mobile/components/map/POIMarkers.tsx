import React from 'react';
import { Marker } from 'react-native-maps';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

interface POI {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: 'hospital' | 'hotel' | 'school' | 'restaurant' | 'church' | 'bar' | 'broadcast' | 'other';
}

interface POIMarkersProps {
  pois?: POI[];
  onPOIPress?: (poi: POI) => void;
}

// Sample POIs for Abakaliki area (can be replaced with API data)
// Coordinates adjusted to be closer to the user's location (6.32306, 8.11201)
const DEFAULT_POIS: POI[] = [
  {
    id: '1',
    name: 'Specialist Maternity',
    latitude: 6.325,
    longitude: 8.113,
    type: 'hospital',
  },
  {
    id: '2',
    name: 'Mc Davis Hotels Abakaliki',
    latitude: 6.324,
    longitude: 8.115,
    type: 'hotel',
  },
  {
    id: '3',
    name: 'Christ Apostolic Church, Azuiyiokwu',
    latitude: 6.326,
    longitude: 8.116,
    type: 'church',
  },
  {
    id: '4',
    name: 'Little Saint School',
    latitude: 6.322,
    longitude: 8.111,
    type: 'school',
  },
  {
    id: '5',
    name: 'Saint High School, Abakaliki',
    latitude: 6.321,
    longitude: 8.110,
    type: 'school',
  },
  {
    id: '6',
    name: 'ASSORTED LOUNGE',
    latitude: 6.324,
    longitude: 8.114,
    type: 'bar',
  },
  {
    id: '7',
    name: 'Ebonyi Broadcasting Corporation',
    latitude: 6.323,
    longitude: 8.112,
    type: 'broadcast',
  },
  {
    id: '8',
    name: 'Club Solac',
    latitude: 6.327,
    longitude: 8.117,
    type: 'bar',
  },
  {
    id: '9',
    name: 'Primary School',
    latitude: 6.320,
    longitude: 8.109,
    type: 'school',
  },
];

const getPOIIcon = (type: POI['type']) => {
  switch (type) {
    case 'hospital':
      return { name: 'hospital', library: 'MaterialCommunityIcons', color: '#DC2626' };
    case 'hotel':
      return { name: 'bed', library: 'MaterialCommunityIcons', color: '#2563EB' };
    case 'school':
      return { name: 'school', library: 'MaterialCommunityIcons', color: '#7C3AED' };
    case 'restaurant':
      return { name: 'utensils', library: 'FontAwesome5', color: '#EA580C' };
    case 'church':
      return { name: 'church', library: 'MaterialCommunityIcons', color: '#059669' };
    case 'bar':
      return { name: 'glass-cocktail', library: 'MaterialCommunityIcons', color: '#DB2777' };
    case 'broadcast':
      return { name: 'radio', library: 'MaterialCommunityIcons', color: '#6366F1' };
    default:
      return { name: 'map-marker', library: 'MaterialCommunityIcons', color: '#6B7280' };
  }
};

const POIMarkers: React.FC<POIMarkersProps> = ({ pois = DEFAULT_POIS, onPOIPress }) => {
  if (!pois || pois.length === 0) {
    return null;
  }

  return (
    <>
      {pois.map((poi) => {
        if (!poi.latitude || !poi.longitude || isNaN(poi.latitude) || isNaN(poi.longitude)) {
          return null;
        }

        const icon = getPOIIcon(poi.type);
        
        return (
          <Marker
            key={poi.id}
            coordinate={{
              latitude: poi.latitude,
              longitude: poi.longitude,
            }}
            onPress={() => onPOIPress?.(poi)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.markerContainer}>
              <View style={[styles.iconContainer, { backgroundColor: icon.color }]}>
                {icon.library === 'MaterialCommunityIcons' && (
                  <MaterialCommunityIcons name={icon.name as any} size={16} color="white" />
                )}
                {icon.library === 'FontAwesome5' && (
                  <FontAwesome5 name={icon.name as any} size={14} color="white" />
                )}
                {icon.library === 'Ionicons' && (
                  <Ionicons name={icon.name as any} size={16} color="white" />
                )}
              </View>
              <View style={styles.labelContainer}>
                <Text style={styles.labelText} numberOfLines={2}>
                  {poi.name}
                </Text>
              </View>
            </View>
          </Marker>
        );
      })}
    </>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  labelContainer: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 6,
    maxWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default POIMarkers;
export type { POI, POIMarkersProps };
