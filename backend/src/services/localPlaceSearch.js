/**
 * KEKE — Local Place Search (MongoDB)
 * Fuzzy search on name + aliases, $geoNear for distance ranking.
 * Used before Google in place search (local-first).
 */

import Place from '../models/Place.js';
import { detectCity } from '../seeds/nigerianCities.js';

function buildFuzzyRegex(query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = escaped.split(/\s+/);
  return words.map((w) => `(?=.*${w})`).join('');
}

function buildAddress(place) {
  const parts = [];
  if (place.category)
    parts.push(place.category.charAt(0).toUpperCase() + place.category.slice(1));
  if (place.city)
    parts.push(place.city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  if (place.state) parts.push(place.state);
  return parts.join(', ') || 'Nigeria';
}

/**
 * Search local places by query and user location. Returns shape compatible with place search.
 */
export async function searchLocalPlaces(query, userLocation, citySlug = null) {
  if (!query || query.trim().length < 2) return [];

  const q = query.trim();
  const city = citySlug ? { slug: citySlug } : detectCity(userLocation.lat, userLocation.lng);

  const filter = {
    active: true,
    $or: [
      { name: { $regex: buildFuzzyRegex(q), $options: 'i' } },
      { aliases: { $elemMatch: { $regex: buildFuzzyRegex(q), $options: 'i' } } },
    ],
  };
  if (city) filter.city = city.slug;

  const results = await Place.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
        distanceField: 'distanceMeters',
        maxDistance: 40000,
        query: filter,
        spherical: true,
      },
    },
    {
      $addFields: {
        relevanceScore: {
          $subtract: [{ $multiply: ['$popularity', 10] }, { $divide: ['$distanceMeters', 500] }],
        },
        prefixBonus: {
          $cond: {
            if: { $regexMatch: { input: { $toLower: '$name' }, regex: `^${q.toLowerCase()}` } },
            then: 20,
            else: 0,
          },
        },
      },
    },
    { $addFields: { finalScore: { $add: ['$relevanceScore', '$prefixBonus'] } } },
    { $sort: { finalScore: -1 } },
    { $limit: 8 },
    {
      $project: {
        _id: 1,
        name: 1,
        category: 1,
        city: 1,
        state: 1,
        source: 1,
        popularity: 1,
        distanceMeters: 1,
        location: {
          lat: { $arrayElemAt: ['$location.coordinates', 1] },
          lng: { $arrayElemAt: ['$location.coordinates', 0] },
        },
      },
    },
  ]);

  return results.map((r) => ({
    placeId: `local:${r._id}`,
    name: r.name,
    address: buildAddress(r),
    location: r.location,
    source: 'local',
    category: r.category,
    distanceM: Math.round(r.distanceMeters),
  }));
}

/**
 * Popular places near user (quick picks before typing). Requires popularity >= 7.
 */
export async function getPopularNearby(userLocation, limit = 6) {
  const city = detectCity(userLocation.lat, userLocation.lng);

  const results = await Place.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
        distanceField: 'distanceMeters',
        maxDistance: 5000,
        query: {
          active: true,
          ...(city ? { city: city.slug } : {}),
          popularity: { $gte: 7 },
        },
        spherical: true,
      },
    },
    { $sort: { popularity: -1, distanceMeters: 1 } },
    { $limit: limit },
    {
      $project: {
        name: 1,
        category: 1,
        city: 1,
        distanceMeters: 1,
        location: {
          lat: { $arrayElemAt: ['$location.coordinates', 1] },
          lng: { $arrayElemAt: ['$location.coordinates', 0] },
        },
      },
    },
  ]);

  return results.map((r) => ({
    placeId: `local:${r._id}`,
    name: r.name,
    category: r.category,
    location: r.location,
    distanceM: Math.round(r.distanceMeters),
    source: 'local',
  }));
}

/**
 * Reverse geocode: find a local place within ~30m of the given point.
 */
export async function reverseGeocodeLocal(lat, lng) {
  const result = await Place.findOne({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: 30,
      },
    },
    active: true,
  });

  if (!result) return null;

  return {
    placeId: `local:${result._id}`,
    name: result.name,
    address: buildAddress(result),
    location: {
      lat: result.location.coordinates[1],
      lng: result.location.coordinates[0],
    },
    source: 'local',
  };
}
