/**
 * Uber-level place search endpoint.
 * GET /api/maps/places/search?q=kiliman&lat=6.32&lng=8.11
 */

import { asyncHandler } from '../utils/errors.js';
import { searchPlaces } from '../services/placeSearchService.js';

export const placeSearch = asyncHandler(async (req, res) => {
  const { q, lat, lng, sessionToken } = req.query;
  const results = await searchPlaces(q, lat, lng, sessionToken);
  res.json({
    status: 'success',
    data: {
      predictions: results,
    },
  });
});
