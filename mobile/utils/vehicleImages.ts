/**
 * Helper function to get local vehicle image asset
 * Falls back to local assets when API doesn't provide image URL
 */
export const getVehicleImage = (vehicleId: number, vehicleType?: string): any => {
  // Map by vehicle type name for accuracy (vehicle-2.png is Car, vehicle-3.png is Bike)
  if (vehicleType) {
    const typeName = vehicleType.toLowerCase();
    if (typeName.includes("keke") || typeName.includes("tuk")) {
      return require("@/assets/images/vehicle-1.png");
    }
    if (typeName.includes("bike") || typeName.includes("motorcycle")) {
      return require("@/assets/images/vehicle-3.png"); // vehicle-3.png is the bike image
    }
    if (typeName.includes("car") || typeName.includes("auto")) {
      return require("@/assets/images/vehicle-2.png"); // vehicle-2.png is the car image
    }
  }

  // Fallback: Map vehicle_id to local assets
  // Note: vehicle-2.png is Car, vehicle-3.png is Bike (images are swapped from expected)
  const imageMap: { [key: number]: any } = {
    1: require("@/assets/images/vehicle-1.png"), // Keke
    2: require("@/assets/images/vehicle-2.png"), // Car (not Bike!)
    3: require("@/assets/images/vehicle-3.png"), // Bike (not Car!)
  };

  // Return mapped image if exists, otherwise return first vehicle image as default
  return imageMap[vehicleId] || imageMap[1] || require("@/assets/images/vehicle-1.png");
};

/**
 * Get vehicle image source - prefers API URL, falls back to local asset
 */
export const getVehicleImageSource = (
  vehicleId: number,
  apiImageUrl: string | null | undefined,
  vehicleType?: string
): { uri?: string; source?: any } => {
  // If API provides a valid URL, use it
  if (apiImageUrl && typeof apiImageUrl === "string" && apiImageUrl.trim() !== "") {
    return { uri: apiImageUrl };
  }

  // Otherwise, use local asset
  return { source: getVehicleImage(vehicleId, vehicleType) };
};
