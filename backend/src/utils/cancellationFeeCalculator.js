import logger from '../utils/logger.js';

/**
 * Calculate cancellation fee based on ride status and timing
 */
export const calculateCancellationFee = (ride, cancelledBy) => {
  try {
    const baseFare = ride.fare?.baseFare || 0;
    const totalFare = ride.fare?.totalFare || 0;
    const now = new Date();
    const rideCreatedAt = ride.createdAt || now;
    const timeSinceCreation = (now - rideCreatedAt) / 1000 / 60; // minutes

    let cancellationFee = 0;
    let feeReason = '';

    // If rider cancels before driver accepts, no fee
    if (cancelledBy === 'rider' && ['requested', 'searching'].includes(ride.status)) {
      cancellationFee = 0;
      feeReason = 'Cancelled before driver acceptance';
      return { cancellationFee, feeReason };
    }

    // If driver cancels, no fee to rider (but may affect driver rating)
    if (cancelledBy === 'driver') {
      cancellationFee = 0;
      feeReason = 'Driver cancellation - no fee';
      return { cancellationFee, feeReason };
    }

    // Rider cancellation after driver acceptance
    if (cancelledBy === 'rider' && ['accepted', 'driver_en_route', 'arrived'].includes(ride.status)) {
      // Fee is 20% of base fare if cancelled within 5 minutes of acceptance
      if (ride.acceptedAt) {
        const timeSinceAcceptance = (now - ride.acceptedAt) / 1000 / 60; // minutes
        if (timeSinceAcceptance <= 5) {
          cancellationFee = Math.round(baseFare * 0.2);
          feeReason = 'Cancelled within 5 minutes of driver acceptance';
        } else {
          // 50% of base fare if cancelled after 5 minutes
          cancellationFee = Math.round(baseFare * 0.5);
          feeReason = 'Cancelled after 5 minutes of driver acceptance';
        }
      } else {
        // Fallback: 20% of base fare
        cancellationFee = Math.round(baseFare * 0.2);
        feeReason = 'Cancelled after driver acceptance';
      }
    }

    // Rider cancellation after ride started (in-progress)
    if (cancelledBy === 'rider' && ride.status === 'in-progress') {
      // 50% of total fare
      cancellationFee = Math.round(totalFare * 0.5);
      feeReason = 'Cancelled during ride - 50% of total fare';
    }

    // System cancellation (e.g., no driver found) - no fee
    if (cancelledBy === 'system') {
      cancellationFee = 0;
      feeReason = 'System cancellation - no fee';
    }

    // Cap cancellation fee at 50% of total fare
    const maxFee = Math.round(totalFare * 0.5);
    if (cancellationFee > maxFee) {
      cancellationFee = maxFee;
      feeReason += ' (capped at 50% of total fare)';
    }

    // Minimum fee of 0 (no negative fees)
    if (cancellationFee < 0) {
      cancellationFee = 0;
    }

    logger.info(`Cancellation fee calculated for ride ${ride._id}: ${cancellationFee} (${feeReason})`);
    return { cancellationFee, feeReason };
  } catch (error) {
    logger.error(`Error calculating cancellation fee: ${error.message}`);
    // Return 0 fee on error to avoid blocking cancellation
    return { cancellationFee: 0, feeReason: 'Error calculating fee - no charge' };
  }
};

export default {
  calculateCancellationFee,
};
