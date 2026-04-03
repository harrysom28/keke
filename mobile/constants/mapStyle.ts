// Enhanced Bolt-style map with improved street name readability
export const BOLT_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [{ color: "#f5f7f9" }]
  },
  // Make all text labels darker and more readable
  {
    elementType: "labels.text.fill",
    stylers: [
      { color: "#2c2f33" },  // Darker for better contrast
      { weight: 1.5 }         // Slightly bolder
    ]
  },
  {
    elementType: "labels.text.stroke",
    stylers: [
      { color: "#ffffff" },
      { weight: 3.5 }  // Thicker white outline for better readability
    ]
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#b8bcc2" }]
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#a4a8ae" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#8c9096" }]
  },
  // IMPROVED: Show street names on local roads (instead of simplified)
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [{ visibility: "on" }]  // Changed from "simplified"
  },
  {
    featureType: "road.arterial",
    elementType: "labels",
    stylers: [{ visibility: "on" }]  // Changed from "simplified"
  },
  // Make local road labels darker and bolder
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [
      { color: "#1a1d20" },  // Much darker for better visibility
      { weight: 2 }           // Bolder text
    ]
  },
  // Make arterial road labels darker
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [
      { color: "#1a1d20" },
      { weight: 2 }
    ]
  },
  // Make highway labels even more prominent
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [
      { color: "#000000" },
      { weight: 2.5 }
    ]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#dce0e4" }]
  }
];

// Backward compatibility
export const LIGHT_MAP_STYLE: typeof BOLT_MAP_STYLE = BOLT_MAP_STYLE;

/** Light desaturated style; keeps Google default POIs visible (no poi visibility override). */
export const LIGHT_DESATURATED_MAP_STYLE: typeof BOLT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f0f2f4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a3d42" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#c4c8cc" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#b0b4b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#9ca0a4" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d8dce0" }] },
];

/** Minimal Bolt-style: few important POIs, lighter roads. */
export const MINIMAL_BOLT_MAP_STYLE: typeof BOLT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f7f9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#2c2f33" }, { weight: 1.5 }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2.5 }] },
  /** Simplified POIs: hospitals, landmarks, major businesses – not all */
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.medical", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.attraction", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#d0d4d8" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#b8bcc2" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#9ca0a6" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e2e6ea" }] },
];
