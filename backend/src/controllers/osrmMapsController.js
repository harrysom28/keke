/**
 * OSRM + Maps Controller
 * - Directions: OSRM
 * - Place search: Multi-layer pipeline (MongoDB + Mapbox + Photon)
 * - Geocoding/Place details: Nominatim (fallback) + local Place model
 */

import { asyncHandler } from '../utils/errors.js';
import { ValidationError } from '../utils/errors.js';
import * as osrmRoutingService from '../services/osrmRoutingService.js';
import * as nominatimService from '../services/nominatimGeocodingService.js';
import { searchPlaces as searchPlacesService } from '../services/placeSearchService.js';
import { getPlaceDetails as getGooglePlaceDetails } from '../services/placeSearchService.js';
import Place from '../models/Place.js';
import PickupPoint from '../models/PickupPoint.js';
import logger from '../utils/logger.js';
import { googleMapsRequest } from '../lib/googleMapsClient.js';

const AVERAGE_SPEED_KMH = 25;

/**
 * Get route - GET /api/maps/directions
 * Uses OSRM with Redis route cache
 */
export const getDirections = asyncHandler(async (req, res) => {
  const { origin, destination } = req.query;

  if (!origin || !destination) {
    throw new ValidationError('Origin and destination are required');
  }

  const parseCoords = (s) => {
    const parts = String(s).split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return { lat: parts[0], lng: parts[1] };
    }
    return null;
  };

  const o = parseCoords(origin);
  const d = parseCoords(destination);
  if (!o || !d) {
    throw new ValidationError('Invalid origin or destination coordinates');
  }

  // Same point or very close: return zero route so client doesn't get 400 from OSRM
  const samePointThreshold = 1e-5; // ~1m
  const samePoint =
    Math.abs(o.lat - d.lat) < samePointThreshold && Math.abs(o.lng - d.lng) < samePointThreshold;
  if (samePoint) {
    const point = { latitude: o.lat, longitude: o.lng };
    res.json({
      status: 'success',
      data: {
        routes: [
          {
            legs: [
              {
                distance: { value: 0, text: '0 km' },
                duration: { value: 0, text: '0 min' },
                start_location: point,
                end_location: point,
              },
            ],
            overview_polyline: { points: '' },
            polyline: [point],
          },
        ],
      },
    });
    return;
  }

  try {
    const route = await osrmRoutingService.getRoute(o.lat, o.lng, d.lat, d.lng);

    const legs = [
      {
        distance: route.distance,
        duration: route.duration,
        start_location: route.polyline?.[0]
          ? { latitude: route.polyline[0].latitude, longitude: route.polyline[0].longitude }
          : null,
        end_location: route.polyline?.length
          ? {
              latitude: route.polyline[route.polyline.length - 1].latitude,
              longitude: route.polyline[route.polyline.length - 1].longitude,
            }
          : null,
      },
    ];

    res.json({
      status: 'success',
      data: {
        routes: [
          {
            legs,
            overview_polyline: { points: route.overview_polyline || '' },
            polyline: route.polyline,
          },
        ],
      },
    });
  } catch (err) {
    logger.warn('OSRM directions failed, falling back to straight-line route', { error: err.message });
    const startPoint = { latitude: o.lat, longitude: o.lng };
    const endPoint = { latitude: d.lat, longitude: d.lng };
    const R = 6371000;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(d.lat - o.lat);
    const dLng = rad(d.lng - o.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(o.lat)) * Math.cos(rad(d.lat)) * Math.sin(dLng / 2) ** 2;
    const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const durationSec = Math.round((distM / 1000 / AVERAGE_SPEED_KMH) * 3600);
    res.json({
      status: 'success',
      data: {
        routes: [
          {
            legs: [
              {
                distance: { value: distM, text: `${(distM / 1000).toFixed(1)} km` },
                duration: { value: durationSec, text: `${Math.round(durationSec / 60)} min` },
                start_location: startPoint,
                end_location: endPoint,
              },
            ],
            overview_polyline: { points: '' },
            polyline: [startPoint, endPoint],
          },
        ],
      },
    });
  }
});

/**
 * Geocode address - GET /api/maps/geocode
 */
export const geocodeAddress = asyncHandler(async (req, res) => {
  const { address, latlng } = req.query;

  if (latlng) {
    const [lat, lng] = String(latlng).split(',').map((p) => parseFloat(p.trim()));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      const result = await nominatimService.reverseGeocode(lat, lng);
      res.json({
        status: 'success',
        data: {
          results: result ? [result] : [],
        },
      });
      return;
    }
  }

  if (!address) {
    throw new ValidationError('Address or latlng is required');
  }

  const results = await nominatimService.geocodeAddress(address);
  res.json({
    status: 'success',
    data: { results },
  });
});

/**
 * Resolve pickup label - GET /api/maps/pickup-label?lat=&lng=
 * Priority:
 * 1) Local Place within 30m (MongoDB `places` collection)
 * 2) Google reverse geocode: POI/establishment → street_number+route → neighborhood/sublocality → locality
 * 3) Fallback: "Near [locality]" or "Current location"
 */
const BROAD_TYPES = ['administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3', 'country'];

export const resolvePickupLabel = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  console.log('[Location] Resolving coordinates:', { lat, lng });

  // Step 1: local place within 30m
  const local = await Place.findOne({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: 30,
      },
    },
    active: true,
  })
    .select('name city')
    .lean();

  console.log('[Location] Local DB result:', local?.name ?? 'none');
  if (local?.name) {
    return res.json({
      status: 'success',
      data: { label: local.name, formatted_address: null, locality: local.city || null, source: 'local' },
    });
  }

  const extractBestFromGoogle = (payload) => {
    const results = payload?.results || [];
    let bestLabel = null;
    let locality = null;

    const getComponent = (components, type) => {
      const c = (components || []).find((x) => Array.isArray(x.types) && x.types.includes(type));
      return c?.long_name || null;
    };

    for (const r of results) {
      const comps = r.address_components || [];
      const types = Array.isArray(r.types) ? r.types : [];
      const isBroadResult = types.some((t) => BROAD_TYPES.includes(t));
      locality =
        locality ||
        getComponent(comps, 'locality') ||
        getComponent(comps, 'sublocality') ||
        getComponent(comps, 'administrative_area_level_2') ||
        null;

      const hasPoi =
        types.includes('establishment') || types.includes('point_of_interest');
      if (hasPoi) {
        const poi = getComponent(comps, 'point_of_interest') || getComponent(comps, 'establishment');
        if (poi) return { label: poi, locality };
      }

      const streetNumber = getComponent(comps, 'street_number');
      const route = getComponent(comps, 'route');
      if (streetNumber && route) {
        return { label: `${streetNumber} ${route}`, locality };
      }

      const neighborhood = getComponent(comps, 'neighborhood');
      const sublocality =
        getComponent(comps, 'sublocality') || getComponent(comps, 'sublocality_level_1');
      const locHere = getComponent(comps, 'locality') || getComponent(comps, 'administrative_area_level_2') || locality;
      if (neighborhood) {
        const label = locHere && locHere !== neighborhood ? `${neighborhood}, ${locHere}` : neighborhood;
        return { label, locality: locHere || locality };
      }
      if (sublocality) {
        const label = locHere && locHere !== sublocality ? `${sublocality}, ${locHere}` : sublocality;
        return { label, locality: locHere || locality };
      }

      const loc = getComponent(comps, 'locality');
      // Reject overly broad (state/LGA/district/country); treat locality-only as vague → fallback "Near X"
      const admin1 = getComponent(comps, 'administrative_area_level_1');
      const admin2 = getComponent(comps, 'administrative_area_level_2');
      const admin3 = getComponent(comps, 'administrative_area_level_3');
      const country = getComponent(comps, 'country');
      const onlyBroad =
        !!(admin1 || admin2 || admin3 || country) &&
        !streetNumber &&
        !route &&
        !neighborhood &&
        !sublocality &&
        !loc;
      if (onlyBroad || isBroadResult) continue;
      // Locality-only (no street/sublocality): return null label so handler uses "Near [locality]"
      if (loc) return { label: null, locality: loc };
    }

    return { label: bestLabel, locality };
  };

  // Step 2: Google reverse geocode (if configured)
  try {
    const payload = await googleMapsRequest(
      '/geocode/json',
      { latlng: `${lat},${lng}` },
      'geocoding'
    );
    const best = extractBestFromGoogle(payload);
    const fallbackLocality =
      best?.locality ||
      (payload?.results?.[0]?.address_components && (() => {
        const comps = payload.results[0].address_components;
        const c = comps.find((x) =>
          x.types && (x.types.includes('locality') || x.types.includes('sublocality') || x.types.includes('neighborhood'))
        );
        return c?.long_name || null;
      })());
    const fallbackLabel = fallbackLocality ? `Near ${fallbackLocality}` : 'Current location';
    const formattedAddress = payload?.results?.[0]?.formatted_address || null;
    if (best?.label) {
      return res.json({
        status: 'success',
        data: {
          label: best.label,
          formatted_address: formattedAddress,
          locality: best.locality || null,
          source: 'google',
        },
      });
    }
    return res.json({
      status: 'success',
      data: {
        label: fallbackLabel,
        formatted_address: formattedAddress,
        locality: fallbackLocality || null,
        source: 'approximate',
      },
    });
  } catch (err) {
    // Step 3: fallback (never show state/country)
    logger.warn('Pickup label resolution failed; falling back', { error: err.message });
    return res.json({
      status: 'success',
      data: { label: 'Current location', formatted_address: null, locality: null, source: 'fallback' },
    });
  }
});

/**
 * Distance/duration estimate - GET /api/maps/distance-matrix
 * Uses OSRM route (no Google Distance Matrix)
 */
export const distanceMatrix = asyncHandler(async (req, res) => {
  const { origins, destinations } = req.query;

  if (!origins || !destinations) {
    throw new ValidationError('Origins and destinations are required');
  }

  const parsePoint = (s) => {
    const parts = String(s).split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 2) return { lat: parts[0], lng: parts[1] };
    return null;
  };

  const originPoints = origins.split('|').map(parsePoint).filter(Boolean);
  const destPoints = destinations.split('|').map(parsePoint).filter(Boolean);

  if (!originPoints.length || !destPoints.length) {
    throw new ValidationError('Invalid origins or destinations');
  }

  const rows = [];
  for (const orig of originPoints) {
    const elements = [];
    for (const dest of destPoints) {
      try {
        const route = await osrmRoutingService.getRoute(orig.lat, orig.lng, dest.lat, dest.lng);
        elements.push({
          distance: route.distance,
          duration: route.duration,
          status: 'OK',
        });
      } catch {
        elements.push({
          distance: null,
          duration: null,
          status: 'ZERO_RESULTS',
        });
      }
    }
    rows.push({ elements });
  }

  res.json({
    status: 'success',
    data: {
      rows,
      origin_addresses: originPoints.map((p) => `${p.lat},${p.lng}`),
      destination_addresses: destPoints.map((p) => `${p.lat},${p.lng}`),
    },
  });
});

/**
 * Place search - GET /api/maps/places/search and /places/autocomplete
 * Uses multi-layer pipeline: MongoDB (Fuse) → Mapbox → Photon; Redis cache; <200ms target
 */
export const placeSearch = asyncHandler(async (req, res) => {
  const { q, lat, lng, input, location } = req.query;
  const query = q || input || '';
  let searchLat = lat != null ? parseFloat(lat) : null;
  let searchLng = lng != null ? parseFloat(lng) : null;
  if ((searchLat == null || searchLng == null) && location) {
    const parts = String(location).split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 2) {
      searchLat = parts[0];
      searchLng = parts[1];
    }
  }
  if (Number.isNaN(searchLat)) searchLat = null;
  if (Number.isNaN(searchLng)) searchLng = null;

  // Use placeSearchService (local-first + Google); default to Abuja when no location
  const centerLat = searchLat ?? 9.08;
  const centerLng = searchLng ?? 7.39;
  const results = await searchPlacesService(query, centerLat, centerLng);

  const seenIds = new Set();
  const deduped = results.filter((r) => {
    const id = r.place_id || r.placeId;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const predictions = deduped.map((r) => ({
    place_id: r.place_id,
    name: r.name,
    formatted_address: r.formatted_address || r.name,
    description: r.description ?? r.formatted_address ?? r.name,
    structured_formatting: r.structured_formatting ?? {
      main_text: r.name,
      secondary_text: r.formatted_address || '',
    },
    lat: r.lat ?? r.latitude ?? null,
    long: r.long ?? r.longitude ?? null,
    latitude: r.lat ?? r.latitude ?? null,
    longitude: r.long ?? r.longitude ?? null,
    source: r.source ?? 'google',
    ...(r.distanceKm != null && { distanceKm: r.distanceKm, distanceAwayLabel: r.distanceAwayLabel }),
  }));

  res.json({
    status: 'success',
    data: { predictions },
  });
});

/**
 * Place details - GET /api/maps/places/details
 */
/**
 * Nearby places (quick picks) — local seeded + learned places by popularity
 */
export const placesNearby = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) throw new ValidationError('lat and lng are required');

  const { getPopularNearby } = await import('../services/localPlaceSearch.js');
  const places = await getPopularNearby(
    { lat: parseFloat(lat), lng: parseFloat(lng) },
    6
  );
  res.json({ status: 'success', data: { places, pois: places } });
});

/**
 * Place details - GET /api/maps/places/details
 * Resolves local_db places from Place model; others from Nominatim or return from cache
 */
export const placeDetails = asyncHandler(async (req, res) => {
  const { place_id } = req.query;
  if (!place_id) throw new ValidationError('place_id is required');

  const placeIdStr = String(place_id).trim();
  const isMongoId = /^[a-f0-9]{24}$/i.test(placeIdStr);

  // Local place (local:ObjectId from localPlaceSearch)
  if (placeIdStr.startsWith('local:')) {
    const mongoId = placeIdStr.slice(6);
    const place = await Place.findById(mongoId).lean();
    if (place && place.location?.coordinates) {
      const [lng, lat] = place.location.coordinates;
      const address = [place.category, place.city, place.state].filter(Boolean).join(', ') || place.name;
      return res.json({
        status: 'success',
        data: {
          place: {
            place_id: placeIdStr,
            name: place.name,
            formatted_address: address,
            location: { latitude: lat, longitude: lng },
          },
        },
      });
    }
  }

  // Google Places ID (long string, typically ChIJ...): use cached Google details
  if (!isMongoId && placeIdStr.length > 20 && !placeIdStr.startsWith('photon:')) {
    const googlePlace = await getGooglePlaceDetails(placeIdStr);
    if (googlePlace) {
      return res.json({
        status: 'success',
        data: {
          place: {
            place_id: googlePlace.place_id,
            name: googlePlace.name,
            formatted_address: googlePlace.formatted_address,
            location: googlePlace.location
              ? { latitude: googlePlace.location.latitude, longitude: googlePlace.location.longitude }
              : null,
          },
        },
      });
    }
  }

  // Local DB place (MongoDB ObjectId)
  if (isMongoId) {
    const place = await Place.findById(place_id).lean();
    if (place) {
      const [lng, lat] = place.location?.coordinates || [0, 0];
      const address = [place.address, place.city, place.state, place.country].filter(Boolean).join(', ') || place.name;
      return res.json({
        status: 'success',
        data: {
          place: {
            place_id: place._id.toString(),
            name: place.name,
            formatted_address: address,
            location: { latitude: lat, longitude: lng },
          },
        },
      });
    }
    const pickupPoint = await PickupPoint.findById(place_id).lean();
    if (pickupPoint) {
      const [lng, lat] = pickupPoint.location?.coordinates || [0, 0];
      const address = [pickupPoint.city, pickupPoint.state].filter(Boolean).join(', ') || pickupPoint.name;
      return res.json({
        status: 'success',
        data: {
          place: {
            place_id: pickupPoint._id.toString(),
            name: pickupPoint.name,
            formatted_address: address,
            location: { latitude: lat, longitude: lng },
          },
        },
      });
    }
  }

  // Fallback: Nominatim (e.g. mapbox/photon place_id from search)
  const place = await nominatimService.getPlaceDetails(place_id);
  if (!place) {
    return res.json({ status: 'success', data: { place: null } });
  }
  res.json({
    status: 'success',
    data: {
      place: {
        place_id: place.place_id,
        name: place.name,
        formatted_address: place.formatted_address,
        location: place.location
          ? { latitude: place.location.latitude, longitude: place.location.longitude }
          : null,
      },
    },
  });
});
