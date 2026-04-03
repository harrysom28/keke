import mongoose from 'mongoose';

/**
 * Tracks driver challenge completions so we award each task at most once per period.
 * period: "2026-02-05" for daily, "2026-W05" for week, "2026-02" for month as needed.
 */
const driverTaskCompletionSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    taskType: {
      type: String,
      required: true,
      enum: [
        'first_ride_today',
        'rides_3_today',
        'rides_5_today',
        'rides_10_today',
        'early_bird',
        'night_owl',
        'weekend_warrior',
      ],
    },
    period: {
      type: String,
      required: true,
      comment: 'e.g. 2026-02-05 for daily, 2026-W06 for weekend',
    },
    rewardAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

driverTaskCompletionSchema.index({ driver: 1, taskType: 1, period: 1 }, { unique: true });
driverTaskCompletionSchema.index({ driver: 1, period: -1 });

const DriverTaskCompletion = mongoose.model('DriverTaskCompletion', driverTaskCompletionSchema);
export default DriverTaskCompletion;
