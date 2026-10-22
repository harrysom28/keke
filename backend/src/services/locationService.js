/**
 * Location Service - Redis GEO driver indexing
 * Real-time driver locations using Redis GEORADIUS for sub-50ms dispatch queries
 * MongoDB stores last known location; Redis stores active driver positions
 */

import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';

const DRIVER_LOCATIONS_KEY = 'driver_locations';
const DRIVER_LOC_DETAIL_PREFIX = 'driver:loc:';
/** Driver detail blob TTL (seconds); stale members are excluded from GEO reads via matching flow */
const DRIVER_LOC_DETAIL_TTL_SEC = 90;

/**
 * Update driver location in Redis GEO (+ short-lived detail key). Real-time matching reads GEO first.
 */
export async function updateDriverLocation(driverId, longitude, latitude, address = '') {
  const client = getRedisClient();
  if (!client || !client.isOpen) {
    logger.warn('Redis unavailable, skipping GEO update');
    return false;
  }

  try {
    const lng = Number(longitude);
    const lat = Number(latitude);
    await client.geoAdd(DRIVER_LOCATIONS_KEY, {
      longitude: lng,
      latitude: lat,
      member: driverId.toString(),
    });
    const detailKey = `${DRIVER_LOC_DETAIL_PREFIX}${driverId}`;
    await client
      .setEx(
        detailKey,
        DRIVER_LOC_DETAIL_TTL_SEC,
        JSON.stringify({
          lat,
          lng,
          address: address || '',
          updatedAt: Date.now(),
        })
      )
      .catch(() => {});
    return true;
  } catch (err) {
    logger.error('GEOADD failed', { driverId, error: err.message });
    return false;
  }
}

/**
 * Persist last known location to MongoDB (non-blocking for the HTTP path).
 */
export function persistDriverLocationMongo(driverId, longitude, latitude, address = null) {
  const lng = Number(longitude);
  const lat = Number(latitude);
  const $set = {
    'currentLocation.type': 'Point',
    'currentLocation.coordinates': [lng, lat],
    'currentLocation.lastUpdated': new Date(),
  };
  if (address != null && String(address).trim() !== '') {
    $set['currentLocation.address'] = address;
  }
  return Driver.findByIdAndUpdate(driverId, { $set }, { new: false }).exec();
}

/**
 * Remove driver from Redis GEO (when going offline)
 */
export async function removeDriverLocation(driverId) {
  const client = getRedisClient();
  if (!client || !client.isOpen) return false;

  try {
    await client.zRem(DRIVER_LOCATIONS_KEY, driverId.toString());
    await client.del(`${DRIVER_LOC_DETAIL_PREFIX}${driverId}`).catch(() => {});
    return true;
  } catch (err) {
    logger.error('ZREM failed', { driverId, error: err.message });
    return false;
  }
}

/**
 * Find nearby drivers using GEORADIUS or MongoDB fallback
 * Redis GEORADIUS enables sub-50ms dispatch; falls back to MongoDB when Redis unavailable
 */
export async function findNearbyDrivers(longitude, latitude, radiusKm = 2, limit = 10, withDist = true) {
  const client = getRedisClient();
  if (!client || !client.isOpen) {
    return findNearbyDriversFromMongo(latitude, longitude, radiusKm, limit);
  }

  try {
    let driverIds = [];
    const distances = {};

    if (typeof client.geoRadius === 'function') {
      const results = await client.geoRadius(
        DRIVER_LOCATIONS_KEY,
        { longitude: Number(longitude), latitude: Number(latitude) },
        radiusKm,
        'km',
        { SORT: 'ASC', COUNT: limit }
      );
      driverIds = Array.isArray(results) ? results.map((r) => (typeof r === 'string' ? r : r?.member || r)).filter(Boolean) : [];
    }

    if (!driverIds.length) {
      return findNearbyDriversFromMongo(latitude, longitude, radiusKm, limit);
    }

    const objectIds = driverIds
      .filter(Boolean)
      .map((id) => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const drivers = await Driver.find({ _id: { $in: objectIds } })
      .populate('user', 'name phone profileImage rating')
      .populate('vehicleDetails.vehicleType')
      .lean();

    const byId = Object.fromEntries(drivers.map((d) => [d._id.toString(), d]));

    return driverIds
      .map((id) => ({
        driver: byId[id],
        distanceKm: distances[id] ?? null,
      }))
      .filter((r) => r.driver);
  } catch (err) {
    logger.error('GEORADIUS failed', { error: err.message });
    return findNearbyDriversFromMongo(latitude, longitude, radiusKm, limit);
  }
}

/**
 * Fallback: find nearby drivers from MongoDB when Redis is unavailable
 */
async function findNearbyDriversFromMongo(latitude, longitude, maxDistanceKm, limit) {
  const drivers = await Driver.findNearbyAvailable(latitude, longitude, maxDistanceKm);
  const withDistance = drivers.slice(0, limit).map((driver) => ({
    driver,
    distanceKm: null,
  }));
  return withDistance;
}

/**
 * Get driver location from Redis (current) or MongoDB (last known)
 */
export async function getDriverLocation(driverId) {
  const redis = getRedisClient();
  if (redis?.isOpen) {
    try {
      const pos = await redis.geoPos(DRIVER_LOCATIONS_KEY, driverId.toString());
      if (pos && pos[0] && pos[0].latitude != null && pos[0].longitude != null) {
        return {
          latitude: pos[0].latitude,
          longitude: pos[0].longitude,
          source: 'redis',
        };
      }
    } catch (_) {}
  }

  const driver = await Driver.findById(driverId).select('currentLocation').lean();
  if (driver?.currentLocation?.coordinates?.length === 2) {
    return {
      latitude: driver.currentLocation.coordinates[1],
      longitude: driver.currentLocation.coordinates[0],
      source: 'mongodb',
    };
  }
  return null;
}

export default {
  updateDriverLocation,
  persistDriverLocationMongo,
  removeDriverLocation,
  findNearbyDrivers,
  getDriverLocation,
};
