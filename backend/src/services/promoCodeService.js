import Promocode from '../models/Promocode.js';
import { ValidationError } from '../utils/errors.js';

/** Fare the rider actually pays after a stored promo. Never negative, never larger than the fare. */
export function riderFareAfterDiscount(totalFare, discountAmount) {
  const gross = Math.max(0, Number(totalFare) || 0);
  const discount = Math.min(gross, Math.max(0, Number(discountAmount) || 0));
  return gross - discount;
}

/**
 * Single promo lookup used by the preview endpoint and every booking path.
 * Returns a zero discount when no code was sent. Throws ValidationError otherwise.
 */
export async function resolvePromoCodeForRide({ code, user, rideAmount, vehicleTypeId }) {
  if (!code) {
    return { promocode: null, discountAmount: 0 };
  }

  const promocode = await Promocode.findOne({ code: String(code).trim().toUpperCase() });
  if (!promocode) {
    throw new ValidationError('Invalid promo code');
  }

  const validation = promocode.isValid(user, rideAmount || 0, vehicleTypeId || null);
  if (!validation.valid) {
    throw new ValidationError(validation.message);
  }

  return {
    promocode,
    discountAmount: promocode.calculateDiscount(rideAmount || 0),
  };
}
