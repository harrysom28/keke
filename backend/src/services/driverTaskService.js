import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import AdminSettings from '../models/AdminSettings.js';
import DriverTaskCompletion from '../models/DriverTaskCompletion.js';
import logger from '../utils/logger.js';

const TASK_TYPES = [
  'first_ride_today',
  'rides_3_today',
  'rides_5_today',
  'rides_10_today',
  'early_bird',
  'night_owl',
  'weekend_warrior',
];

/**
 * Get period string for daily tasks (YYYY-MM-DD)
 */
function getDailyPeriod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Get period for weekend_warrior: Sunday of the current week (YYYY-MM-DD)
 */
function getWeekendPeriod(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

/**
 * Check if a ride qualifies for early_bird (completed before 8:00 AM local-ish)
 */
function isEarlyBird(completedAt) {
  const d = new Date(completedAt);
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  return hour < 8 || (hour === 8 && min === 0);
}

/**
 * Check if a ride qualifies for night_owl (completed after 10:00 PM)
 */
function isNightOwl(completedAt) {
  const d = new Date(completedAt);
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  return hour > 22 || (hour === 22 && min >= 0);
}

/**
 * Check if date is Saturday or Sunday
 */
function isWeekend(date) {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Award a task completion: add earnings to driver and record completion.
 */
async function awardTask(driver, taskType, period, rewardAmount) {
  if (!driver || !taskType || rewardAmount <= 0) return;
  const existing = await DriverTaskCompletion.findOne({
    driver: driver._id,
    taskType,
    period,
  });
  if (existing) return;
  await DriverTaskCompletion.create({
    driver: driver._id,
    taskType,
    period,
    rewardAmount,
  });
  await driver.addEarnings(rewardAmount);
  logger.info(`Driver task awarded: driver=${driver._id} taskType=${taskType} period=${period} reward=${rewardAmount}`);
}

/**
 * After a ride is completed (and payment done), check and award any newly completed challenges.
 * Call this from driverController.completeRide and paymentService after driver.addEarnings(ride fare).
 */
export async function checkAndAwardTasks(driverId, ride) {
  if (!driverId || !ride || ride.status !== 'completed') return;
  const driver = await Driver.findById(driverId);
  if (!driver) return;
  const settings = await AdminSettings.findOne({ key: 'default' }).lean();
  const rewards = settings?.driverTasks || {};
  const completedAt = ride.completedAt || new Date();

  const dailyPeriod = getDailyPeriod(completedAt);
  const weekendPeriod = getWeekendPeriod(completedAt);

  const todayCompletedRides = await Ride.countDocuments({
    driver: driverId,
    status: 'completed',
    completedAt: {
      $gte: new Date(completedAt.toISOString().slice(0, 10) + 'T00:00:00.000Z'),
      $lte: completedAt,
    },
  });

  const ridesToday = todayCompletedRides;

  if (ridesToday === 1 && rewards.first_ride_today) {
    await awardTask(driver, 'first_ride_today', dailyPeriod, rewards.first_ride_today);
  }
  if (ridesToday >= 3 && rewards.rides_3_today) {
    await awardTask(driver, 'rides_3_today', dailyPeriod, rewards.rides_3_today);
  }
  if (ridesToday >= 5 && rewards.rides_5_today) {
    await awardTask(driver, 'rides_5_today', dailyPeriod, rewards.rides_5_today);
  }
  if (ridesToday >= 10 && rewards.rides_10_today) {
    await awardTask(driver, 'rides_10_today', dailyPeriod, rewards.rides_10_today);
  }
  if (isEarlyBird(completedAt) && rewards.early_bird) {
    await awardTask(driver, 'early_bird', dailyPeriod, rewards.early_bird);
  }
  if (isNightOwl(completedAt) && rewards.night_owl) {
    await awardTask(driver, 'night_owl', dailyPeriod, rewards.night_owl);
  }
  if (isWeekend(completedAt) && rewards.weekend_warrior) {
    const sunday = new Date(weekendPeriod + 'T00:00:00.000Z');
    const saturday = new Date(sunday);
    saturday.setUTCDate(saturday.getUTCDate() - 1);
    const weekendStart = new Date(saturday.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const weekendEnd = new Date(weekendPeriod + 'T23:59:59.999Z');
    const weekendRidesFull = await Ride.countDocuments({
      driver: driverId,
      status: 'completed',
      completedAt: { $gte: weekendStart, $lte: weekendEnd },
    });
    if (weekendRidesFull >= 5) {
      await awardTask(driver, 'weekend_warrior', weekendPeriod, rewards.weekend_warrior);
    }
  }
}

/**
 * Get challenge definitions with labels for API response
 */
export function getChallengeDefinitions() {
  return [
    { id: 'first_ride_today', title: 'First ride of the day', description: 'Complete your first ride today', target: 1, unit: 'ride' },
    { id: 'rides_3_today', title: 'Triple threat', description: 'Complete 3 rides in a day', target: 3, unit: 'rides' },
    { id: 'rides_5_today', title: 'High five', description: 'Complete 5 rides in a day', target: 5, unit: 'rides' },
    { id: 'rides_10_today', title: 'Ten for the win', description: 'Complete 10 rides in a day', target: 10, unit: 'rides' },
    { id: 'early_bird', title: 'Early bird', description: 'Complete a ride before 8:00 AM', target: 1, unit: 'ride' },
    { id: 'night_owl', title: 'Night owl', description: 'Complete a ride after 10:00 PM', target: 1, unit: 'ride' },
    { id: 'weekend_warrior', title: 'Weekend warrior', description: 'Complete 5 rides on Saturday or Sunday', target: 5, unit: 'rides' },
  ];
}

/**
 * Get challenges with progress and rewards for a driver (for GET /driver/challenges).
 */
export async function getChallengesForDriver(driverId) {
  const settings = await AdminSettings.findOne({ key: 'default' }).lean();
  const rewards = settings?.driverTasks || {};
  const definitions = getChallengeDefinitions();
  const now = new Date();
  const dailyPeriod = getDailyPeriod(now);
  const weekendPeriod = getWeekendPeriod(now);

  const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const todayEnd = new Date(now.toISOString().slice(0, 10) + 'T23:59:59.999Z');
  const sunday = new Date(weekendPeriod + 'T00:00:00.000Z');
  const saturday = new Date(sunday);
  saturday.setUTCDate(saturday.getUTCDate() - 1);
  const weekendStart = new Date(saturday.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const weekendEnd = new Date(weekendPeriod + 'T23:59:59.999Z');

  const ridesToday = await Ride.countDocuments({
    driver: driverId,
    status: 'completed',
    completedAt: { $gte: todayStart, $lte: todayEnd },
  });
  const weekendRides = await Ride.countDocuments({
    driver: driverId,
    status: 'completed',
    completedAt: { $gte: weekendStart, $lte: weekendEnd },
  });

  const completions = await DriverTaskCompletion.find({
    driver: driverId,
    $or: [
      { period: dailyPeriod },
      { taskType: 'weekend_warrior', period: weekendPeriod },
    ],
  }).lean();
  const completedSet = new Set(completions.map((c) => `${c.taskType}-${c.period}`));

  return definitions.map((def) => {
    const reward = rewards[def.id] ?? 0;
    let current = 0;
    if (def.id === 'first_ride_today' || def.id.startsWith('rides_')) {
      current = def.id === 'first_ride_today' ? Math.min(1, ridesToday) : ridesToday;
    } else if (def.id === 'weekend_warrior') {
      current = weekendRides;
    } else {
      current = 0;
    }
    const period = def.id === 'weekend_warrior' ? weekendPeriod : dailyPeriod;
    const completed = completedSet.has(`${def.id}-${period}`);
    const completionDoc = completions.find((c) => c.taskType === def.id && c.period === period);
    return {
      challenge_id: def.id,
      title: def.title,
      description: def.description,
      target: def.target,
      unit: def.unit,
      reward_amount: reward,
      current_progress: Math.min(current, def.target),
      completed,
      completed_at: completionDoc?.completedAt ?? null,
      reward_claimed: completionDoc?.rewardAmount ?? null,
    };
  });
}
