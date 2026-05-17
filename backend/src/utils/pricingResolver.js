/**
 * Resolves fare rates: per-vehicle (admin Vehicle Types) with global admin defaults as fallback.
 */

const LEGACY_BASE_THRESHOLD = 50;
const LEGACY_PER_KM_THRESHOLD = 10;

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

/**
 * Global defaults from AdminSettings.pricing, then env, then schema defaults.
 */
export function getGlobalPricingDefaults(adminPricing) {
  const p = adminPricing && typeof adminPricing === 'object' ? adminPricing : {};
  return {
    baseFare: toPositiveNumber(
      p.baseFare,
      parseFloat(process.env.BASE_FARE || '500')
    ),
    perKmRate: toPositiveNumber(
      p.perKmRate,
      parseFloat(process.env.PER_KM_RATE || '150')
    ),
    minimumFare: toPositiveNumber(
      p.minimumFare,
      parseFloat(process.env.MINIMUM_FARE || '800')
    ),
    currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.trim() : 'NGN',
  };
}

/**
 * Use vehicle rate when set and above legacy seed thresholds; otherwise global admin default.
 */
function pickVehicleRate(vehicleValue, globalValue, legacyThreshold = null) {
  const v = Number(vehicleValue);
  if (!Number.isFinite(v) || v < 0) {
    return globalValue;
  }
  if (legacyThreshold != null && v > 0 && v < legacyThreshold) {
    return globalValue;
  }
  return v;
}

/**
 * Build resolved pricing for fare calculation.
 * @param {object|null} vehicleType - Mongoose doc or lean object
 * @param {object|null} adminPricing - AdminSettings.pricing
 */
export function resolveVehicleFarePricing(vehicleType, adminPricing) {
  const global = getGlobalPricingDefaults(adminPricing);

  if (!vehicleType) {
    return {
      ...global,
      multiplier: 1,
      vehicleTypeId: null,
      vehicleTypeName: null,
      pricingSource: 'global',
    };
  }

  const baseFare = pickVehicleRate(
    vehicleType.baseFare,
    global.baseFare,
    LEGACY_BASE_THRESHOLD
  );
  const perKmRate = pickVehicleRate(
    vehicleType.perKmRate,
    global.perKmRate,
    LEGACY_PER_KM_THRESHOLD
  );
  const minimumFare = pickVehicleRate(
    vehicleType.minimumFare,
    global.minimumFare,
    LEGACY_BASE_THRESHOLD
  );

  const baseIsLegacy =
    Number.isFinite(Number(vehicleType.baseFare)) &&
    Number(vehicleType.baseFare) > 0 &&
    Number(vehicleType.baseFare) < LEGACY_BASE_THRESHOLD;
  const mult = Number(vehicleType.multiplier);
  const multiplier =
    baseIsLegacy || !Number.isFinite(mult) || mult < 0.5 || mult > 5 ? 1 : mult;

  const id =
    vehicleType._id?.toString?.() ||
    (typeof vehicleType.vehicle_id === 'string' ? vehicleType.vehicle_id : null);

  return {
    baseFare,
    perKmRate,
    minimumFare,
    currency: global.currency,
    multiplier,
    vehicleTypeId: id,
    vehicleTypeName: vehicleType.name || vehicleType.displayName || null,
    pricingSource: 'vehicle',
  };
}
