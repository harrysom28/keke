import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: [true, 'Ride is required'],
      unique: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Rider is required'],
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver is required'],
    },
    // Rider's review of driver
    riderRating: {
      type: Number,
      required: [true, 'Rider rating is required'],
      min: 1,
      max: 5,
    },
    riderReview: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review cannot exceed 1000 characters'],
    },
    // Driver's review of rider
    driverRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    driverReview: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review cannot exceed 1000 characters'],
      default: null,
    },
    // Review tags/categories
    tags: [
      {
        type: String,
        enum: [
          'punctual',
          'polite',
          'clean_vehicle',
          'safe_driving',
          'helpful',
          'professional',
          'good_communication',
          'comfortable',
          'value_for_money',
        ],
      },
    ],
    isRiderReviewed: {
      type: Boolean,
      default: false,
    },
    isDriverReviewed: {
      type: Boolean,
      default: false,
    },
    riderReviewedAt: {
      type: Date,
      default: null,
    },
    driverReviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
reviewSchema.index({ ride: 1 }, { unique: true });
reviewSchema.index({ rider: 1, createdAt: -1 });
reviewSchema.index({ driver: 1, createdAt: -1 });
reviewSchema.index({ riderRating: 1 });
reviewSchema.index({ driverRating: 1 });

// Virtual for review ID
reviewSchema.virtual('review_id').get(function () {
  return this._id.toString();
});

// Method to add rider review
reviewSchema.methods.addRiderReview = async function (rating, review = null, tags = []) {
  this.riderRating = rating;
  if (review) {
    this.riderReview = review;
  }
  if (tags.length > 0) {
    this.tags = tags;
  }
  this.isRiderReviewed = true;
  this.riderReviewedAt = new Date();
  await this.save();
};

// Method to add driver review
reviewSchema.methods.addDriverReview = async function (rating, review = null) {
  this.driverRating = rating;
  if (review) {
    this.driverReview = review;
  }
  this.isDriverReviewed = true;
  this.driverReviewedAt = new Date();
  await this.save();
};

// Static method to calculate average rating for user
reviewSchema.statics.calculateAverageRating = async function (userId, role = 'passenger') {
  const field = role === 'passenger' ? 'rider' : 'driver';
  const ratingField = role === 'passenger' ? 'riderRating' : 'driverRating';

  const result = await this.aggregate([
    {
      $match: {
        [field]: userId,
        [ratingField]: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: `$${ratingField}` },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  if (result.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10,
    totalReviews: result[0].totalReviews,
  };
};

const Review = mongoose.model('Review', reviewSchema);

export default Review;
