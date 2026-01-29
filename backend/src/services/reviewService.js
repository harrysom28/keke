import Review from '../models/Review.js';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import { createNotification } from './notificationService.js';

/**
 * Request rating/review from rider after ride completion
 */
export const requestRiderReview = async (ride) => {
  try {
    if (!ride || ride.status !== 'completed') {
      throw new Error('Ride must be completed before requesting review');
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ ride: ride._id });
    if (existingReview && existingReview.isRiderReviewed) {
      logger.info(`Review already submitted for ride ${ride._id}`);
      return { success: true, message: 'Review already submitted', review: existingReview };
    }

    // Create review record if it doesn't exist
    let review = existingReview;
    if (!review) {
      review = await Review.create({
        ride: ride._id,
        rider: ride.rider,
        driver: ride.driver,
        isRiderReviewed: false,
        isDriverReviewed: false,
      });
    }

    // Get rider details
    const rider = await User.findById(ride.rider);
    if (!rider) {
      throw new Error('Rider not found');
    }

    // Send notification to rider requesting review
    try {
      await createNotification(
        rider,
        'ride_completed',
        'Rate Your Ride',
        'How was your ride? Please rate your driver and share your experience.',
        {
          rideId: ride._id.toString(),
          reviewId: review._id.toString(),
          type: 'review_request',
        },
        ride._id
      );
      logger.info(`Review request notification sent to rider ${ride.rider} for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to send review request notification: ${error.message}`);
      // Don't throw - notification failure shouldn't block review creation
    }

    return {
      success: true,
      review,
      message: 'Review request sent to rider',
    };
  } catch (error) {
    logger.error(`Failed to request rider review for ride ${ride._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Submit rider review
 */
export const submitRiderReview = async (rideId, rating, review = null, tags = []) => {
  try {
    const reviewRecord = await Review.findOne({ ride: rideId });
    if (!reviewRecord) {
      throw new Error('Review record not found');
    }

    if (reviewRecord.isRiderReviewed) {
      throw new Error('Review already submitted');
    }

    // Add rider review
    await reviewRecord.addRiderReview(rating, review, tags);

    // Update ride with rating
    const ride = await Ride.findById(rideId);
    if (ride) {
      ride.rating.riderRating = rating;
      ride.rating.riderReview = review;
      ride.rating.createdAt = new Date();
      await ride.save();
    }

    // Update driver rating
    const driver = await Driver.findById(reviewRecord.driver);
    if (driver) {
      // Recalculate average rating
      const ratingStats = await Review.aggregate([
        {
          $match: {
            driver: driver._id,
            riderRating: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$riderRating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]);

      if (ratingStats.length > 0) {
        driver.rating.average = Math.round(ratingStats[0].averageRating * 10) / 10;
        driver.rating.count = ratingStats[0].totalReviews;
      } else {
        driver.rating.average = rating;
        driver.rating.count = 1;
      }
      await driver.save();
      logger.info(`Driver rating updated for driver ${driver._id}: ${driver.rating.average} (${driver.rating.count} reviews)`);
    }

    logger.info(`Rider review submitted for ride ${rideId}: ${rating} stars`);
    return { success: true, review: reviewRecord };
  } catch (error) {
    logger.error(`Failed to submit rider review for ride ${rideId}: ${error.message}`);
    throw error;
  }
};

/**
 * Submit driver review
 */
export const submitDriverReview = async (rideId, rating, review = null) => {
  try {
    const reviewRecord = await Review.findOne({ ride: rideId });
    if (!reviewRecord) {
      throw new Error('Review record not found');
    }

    if (reviewRecord.isDriverReviewed) {
      throw new Error('Review already submitted');
    }

    // Add driver review
    await reviewRecord.addDriverReview(rating, review);

    // Update ride with rating
    const ride = await Ride.findById(rideId);
    if (ride) {
      ride.rating.driverRating = rating;
      ride.rating.driverReview = review;
      await ride.save();
    }

    // Update rider rating
    const rider = await User.findById(reviewRecord.rider);
    if (rider) {
      // Recalculate average rating
      const ratingStats = await Review.aggregate([
        {
          $match: {
            rider: rider._id,
            driverRating: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$driverRating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]);

      if (ratingStats.length > 0) {
        rider.rating = Math.round(ratingStats[0].averageRating * 10) / 10;
      } else {
        rider.rating = rating;
      }
      await rider.save();
      logger.info(`Rider rating updated for rider ${rider._id}: ${rider.rating}`);
    }

    logger.info(`Driver review submitted for ride ${rideId}: ${rating} stars`);
    return { success: true, review: reviewRecord };
  } catch (error) {
    logger.error(`Failed to submit driver review for ride ${rideId}: ${error.message}`);
    throw error;
  }
};

export default {
  requestRiderReview,
  submitRiderReview,
  submitDriverReview,
};
