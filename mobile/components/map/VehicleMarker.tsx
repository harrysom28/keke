import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import tw from '@/lib/tailwind';

interface VehicleMarkerProps {
  color?: string;
  vehicleType?: 'car' | 'bike' | 'tricycle';
  heading?: number; // Rotation angle in degrees
}

const VehicleMarker: React.FC<VehicleMarkerProps> = ({ 
  color = '#3C8F7C', 
  vehicleType = 'car',
  heading = 0 
}) => {
  const getIcon = () => {
    switch (vehicleType) {
      case 'bike':
        return 'motorbike';
      case 'tricycle':
        return 'car-sports';
      default:
        return 'car';
    }
  };

  return (
    <View style={styles.container}>
      {/* Shadow/Glow effect */}
      <View style={[styles.shadow, { backgroundColor: color }]} />
      
      {/* Main vehicle icon */}
      <View style={[styles.iconContainer, { backgroundColor: color }]}>
        <MaterialCommunityIcons 
          name={getIcon() as any} 
          size={20} 
          color="white" 
        />
      </View>
      
      {/* Bottom dot indicator */}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.2,
    transform: [{ scale: 1.5 }],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: -2,
    borderWidth: 1.5,
    borderColor: 'white',
  },
});

export default VehicleMarker;
