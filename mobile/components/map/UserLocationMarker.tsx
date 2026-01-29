import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface UserLocationMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
}

const UserLocationMarker: React.FC<UserLocationMarkerProps> = ({ coordinate }) => {
  return (
    <View style={styles.userLocationMarker} pointerEvents="none">
      {/* Outer pulse circle */}
      <View style={styles.pulseCircle} />
      
      {/* Inner blue dot */}
      <View style={styles.userDot}>
        <View style={styles.userDotInner} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  userLocationMarker: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.4)',
  },
  userDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#007AFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  userDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
});

export default UserLocationMarker;
