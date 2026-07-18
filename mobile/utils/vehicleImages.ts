/**
 * Local vehicle thumbnails by type name.
 * vehicle-1 = keke, vehicle-2 = taxi/car, vehicle-3 = okada/bike
 */

const KEKE_IMAGE = require("@/assets/images/vehicle-1.png");
const CAR_IMAGE = require("@/assets/images/vehicle-2.png");
const BIKE_IMAGE = require("@/assets/images/vehicle-3.png");

type VehicleKind = "keke" | "bike" | "car";

function resolveVehicleKind(vehicleType?: string | null): VehicleKind | null {
  if (!vehicleType || typeof vehicleType !== "string") return null;
  const typeName = vehicleType.toLowerCase().trim();

  // Keke / tricycle first (before generic "auto" which can match auto-rickshaw)
  if (
    typeName.includes("keke") ||
    typeName.includes("tuk") ||
    typeName.includes("tricycle") ||
    typeName.includes("rickshaw") ||
    typeName.includes("napep")
  ) {
    return "keke";
  }

  // Okada / motorcycle
  if (
    typeName.includes("okada") ||
    typeName.includes("bike") ||
    typeName.includes("motor") ||
    typeName.includes("scooter")
  ) {
    return "bike";
  }

  // Taxi / car
  if (
    typeName.includes("taxi") ||
    typeName.includes("cab") ||
    typeName.includes("car") ||
    typeName.includes("sedan") ||
    typeName.includes("automobile")
  ) {
    return "car";
  }

  return null;
}

function imageForKind(kind: VehicleKind) {
  if (kind === "keke") return KEKE_IMAGE;
  if (kind === "bike") return BIKE_IMAGE;
  return CAR_IMAGE;
}

/**
 * Helper function to get local vehicle image asset
 * Falls back to local assets when API doesn't provide image URL
 */
export const getVehicleImage = (
  vehicleId: number | string | null | undefined,
  vehicleType?: string
): any => {
  const kind = resolveVehicleKind(vehicleType);
  if (kind) return imageForKind(kind);

  // Numeric id fallback only (Mongo ObjectIds must not map to keke)
  const numericId =
    typeof vehicleId === "number"
      ? vehicleId
      : typeof vehicleId === "string" && /^\d+$/.test(vehicleId)
        ? Number(vehicleId)
        : NaN;

  const imageMap: { [key: number]: any } = {
    1: KEKE_IMAGE,
    2: CAR_IMAGE,
    3: BIKE_IMAGE,
  };

  if (!Number.isNaN(numericId) && imageMap[numericId]) {
    return imageMap[numericId];
  }

  return KEKE_IMAGE;
};

/**
 * Image source for <Image />.
 * Prefers type-matched local asset, then API URL, then id fallback.
 * Local-by-name first avoids DB rows that all point at the same keke image.
 */
export const getVehicleImageSource = (
  vehicleId: number | string | null | undefined,
  apiImageUrl: string | null | undefined,
  vehicleType?: string
): any => {
  const kind = resolveVehicleKind(vehicleType);
  if (kind) {
    return imageForKind(kind);
  }

  if (apiImageUrl && typeof apiImageUrl === "string" && apiImageUrl.trim() !== "") {
    return { uri: apiImageUrl.trim() };
  }

  return getVehicleImage(vehicleId, vehicleType);
};
