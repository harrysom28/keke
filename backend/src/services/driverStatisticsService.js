import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import logger from '../utils/logger.js';

/**
 * Update driver acceptance rate
 */
export const updateDriverAcceptanceRate = async (driverId) => {
  try {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    // Count total rides offered to this driver
    const totalOffered = await Ride.countDocuments({
      driver: driverId,
      status: { $in: ['requested', 'accepted', 'arrived', 'in-progress', 'completed', 'cancelled'] },
    });

    // Count accepted rides
    const totalAccepted = await Ride.countDocuments({
      driver: driverId,
      acceptedByDriver: true,
      status: { $in: ['accepted', 'driver_en_route', 'arrived', 'in-progress', 'completed'] },
    });

    // Calculate acceptance rate
    let acceptanceRate = 0;
    if (totalOffered > 0) {
      acceptanceRate = Math.round((totalAccepted / totalOffered) * 100);
    }

    driver.acceptanceRate = acceptanceRate;
    await driver.save();

    logger.info(`Driver ${driverId} acceptance rate updated: ${acceptanceRate}% (${totalAccepted}/${totalOffered})`);
    return { acceptanceRate, totalOffered, totalAccepted };
  } catch (error) {
    logger.error(`Failed to update driver acceptance rate for driver ${driverId}: ${error.message}`);
    throw error;
  }
};

/**
 * Update driver cancellation rate
 */
export const updateDriverCancellationRate = async (driverId) => {
  try {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    // Count total rides accepted by this driver
    const totalAccepted = await Ride.countDocuments({
      driver: driverId,
      acceptedByDriver: true,
      status: { $in: ['accepted', 'arrived', 'in-progress', 'completed', 'cancelled'] },
    });

    // Count cancelled rides (cancelled by driver)
    const totalCancelled = await Ride.countDocuments({
      driver: driverId,
      'cancellation.cancelledBy': 'driver',
      status: 'cancelled',
    });

    // Calculate cancellation rate
    let cancellationRate = 0;
    if (totalAccepted > 0) {
      cancellationRate = Math.round((totalCancelled / totalAccepted) * 100);
    }

    driver.cancellationRate = cancellationRate;
    await driver.save();

    logger.info(`Driver ${driverId} cancellation rate updated: ${cancellationRate}% (${totalCancelled}/${totalAccepted})`);
    return { cancellationRate, totalAccepted, totalCancelled };
  } catch (error) {
    logger.error(`Failed to update driver cancellation rate for driver ${driverId}: ${error.message}`);
    throw error;
  }
};

/**
 * Update all driver statistics (acceptance rate, cancellation rate, rating)
 */
export const updateDriverStatistics = async (driverId) => {
  try {
    await Promise.all([
      updateDriverAcceptanceRate(driverId),
      updateDriverCancellationRate(driverId),
    ]);
    logger.info(`All statistics updated for driver ${driverId}`);
  } catch (error) {
    logger.error(`Failed to update driver statistics for driver ${driverId}: ${error.message}`);
    throw error;
  }
};

export default {
  updateDriverAcceptanceRate,
  updateDriverCancellationRate,
  updateDriverStatistics,
};
