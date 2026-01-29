// IMPORTANT: For Android, we need a MINIMAL style array
// Complex styles cause the map to render incorrectly

export const LIGHT_MAP_STYLE = [
  {
    "featureType": "poi.business",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "transit",
    "stylers": [{ "visibility": "simplified" }]
  }
];

// Alternative: Use Google's predefined map types instead of custom styles
// This is MORE RELIABLE on Android
export const MAP_TYPES = {
  STANDARD: 'standard',    // Default
  SATELLITE: 'satellite',
  HYBRID: 'hybrid',
  TERRAIN: 'terrain',
  NONE: 'none'
};
