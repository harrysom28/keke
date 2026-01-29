import axios from 'axios';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_API_BASE = 'https://maps.googleapis.com/maps/api';

/**
 * Places autocomplete - GET /api/maps/places/autocomplete
 */
export const placesAutocomplete = asyncHandler(async (req, res) => {
  const { input, location, radius, types } = req.query;

  if (!input) {
    throw new ValidationError('Input query is required');
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new ValidationError('Google Maps API key is not configured');
  }

  try {
    const params = {
      input,
      key: GOOGLE_MAPS_API_KEY,
      components: 'country:ng', // Default to Nigeria, can be made configurable
    };

    if (location) {
      const [lat, lng] = location.split(',').map(parseFloat);
      params.location = `${lat},${lng}`;
      params.radius = radius || 5000; // 5km default radius
    }

    if (types) {
      params.types = types; // e.g., establishment, geocode
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_BASE}/place/autocomplete/json`, { params });
    
    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      logger.error(`Google Maps API error: ${response.data.status} - ${response.data.error_message}`);
      throw new ValidationError(`Places autocomplete failed: ${response.data.status}`);
    }

    const predictions = (response.data.predictions || []).map((prediction) => ({
      place_id: prediction.place_id,
      description: prediction.description,
      structured_formatting: prediction.structured_formatting,
      types: prediction.types,
      reference: prediction.reference,
    }));

    res.json({
      status: 'success',
      data: {
        predictions,
        status: response.data.status,
      },
    });
  } catch (error) {
    logger.error(`Places autocomplete error: ${error.message}`);
    if (error.response) {
      throw new ValidationError(`Google Maps API error: ${error.response.data?.error_message || error.message}`);
    }
    throw error;
  }
});

/**
 * Place details - GET /api/maps/places/details
 */
export const placeDetails = asyncHandler(async (req, res) => {
  const { place_id, fields } = req.query;

  if (!place_id) {
    throw new ValidationError('Place ID is required');
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new ValidationError('Google Maps API key is not configured');
  }

  try {
    const params = {
      place_id,
      key: GOOGLE_MAPS_API_KEY,
      fields: fields || 'formatted_address,geometry,name,place_id,formatted_phone_number,international_phone_number,opening_hours,rating,user_ratings_total,types,website',
    };

    const response = await axios.get(`${GOOGLE_MAPS_API_BASE}/place/details/json`, { params });
    
    if (response.data.status !== 'OK') {
      logger.error(`Google Maps API error: ${response.data.status} - ${response.data.error_message}`);
      throw new NotFoundError(`Place not found: ${response.data.status}`);
    }

    const place = response.data.result;

    res.json({
      status: 'success',
      data: {
        place: {
          place_id: place.place_id,
          name: place.name,
          formatted_address: place.formatted_address,
          location: place.geometry?.location ? {
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
          } : null,
          formatted_phone_number: place.formatted_phone_number,
          international_phone_number: place.international_phone_number,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          types: place.types,
          website: place.website,
          opening_hours: place.opening_hours,
        },
      },
    });
  } catch (error) {
    logger.error(`Place details error: ${error.message}`);
    if (error.response) {
      throw new ValidationError(`Google Maps API error: ${error.response.data?.error_message || error.message}`);
    }
    throw error;
  }
});

/**
 * Get directions - GET /api/maps/directions
 */
export const getDirections = asyncHandler(async (req, res) => {
  const { origin, destination, mode, waypoints, alternatives, avoid } = req.query;

  if (!origin || !destination) {
    throw new ValidationError('Origin and destination are required');
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new ValidationError('Google Maps API key is not configured');
  }

  try {
    const params = {
      origin,
      destination,
      key: GOOGLE_MAPS_API_KEY,
      mode: mode || 'driving', // driving, walking, bicycling, transit
    };

    if (waypoints) {
      params.waypoints = waypoints;
    }

    if (alternatives === 'true') {
      params.alternatives = 'true';
    }

    if (avoid) {
      params.avoid = avoid; // tolls, highways, ferries, indoor
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_BASE}/directions/json`, { params });
    
    if (response.data.status !== 'OK') {
      logger.error(`Google Maps Directions API error: ${response.data.status} - ${response.data.error_message}`);
      throw new ValidationError(`Directions failed: ${response.data.status}`);
    }

    const routes = (response.data.routes || []).map((route) => ({
      summary: route.summary,
      legs: route.legs.map((leg) => ({
        distance: {
          value: leg.distance.value, // meters
          text: leg.distance.text,
        },
        duration: {
          value: leg.duration.value, // seconds
          text: leg.duration.text,
        },
        start_address: leg.start_address,
        end_address: leg.end_address,
        start_location: {
          latitude: leg.start_location.lat,
          longitude: leg.start_location.lng,
        },
        end_location: {
          latitude: leg.end_location.lat,
          longitude: leg.end_location.lng,
        },
        steps: leg.steps.map((step) => ({
          distance: {
            value: step.distance.value,
            text: step.distance.text,
          },
          duration: {
            value: step.duration.value,
            text: step.duration.text,
          },
          html_instructions: step.html_instructions,
          polyline: step.polyline,
          start_location: {
            latitude: step.start_location.lat,
            longitude: step.start_location.lng,
          },
          end_location: {
            latitude: step.end_location.lat,
            longitude: step.end_location.lng,
          },
          travel_mode: step.travel_mode,
        })),
      })),
      overview_polyline: route.overview_polyline,
      bounds: route.bounds,
      warnings: route.warnings,
      waypoint_order: route.waypoint_order,
    }));

    res.json({
      status: 'success',
      data: {
        routes,
        status: response.data.status,
      },
    });
  } catch (error) {
    logger.error(`Get directions error: ${error.message}`);
    if (error.response) {
      throw new ValidationError(`Google Maps API error: ${error.response.data?.error_message || error.message}`);
    }
    throw error;
  }
});

/**
 * Geocode address - GET /api/maps/geocode
 */
export const geocodeAddress = asyncHandler(async (req, res) => {
  const { address, latlng, place_id } = req.query;

  if (!address && !latlng && !place_id) {
    throw new ValidationError('Address, latlng, or place_id is required');
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new ValidationError('Google Maps API key is not configured');
  }

  try {
    const params = {
      key: GOOGLE_MAPS_API_KEY,
    };

    if (address) {
      params.address = address;
    } else if (latlng) {
      params.latlng = latlng;
    } else if (place_id) {
      params.place_id = place_id;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_BASE}/geocode/json`, { params });
    
    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      logger.error(`Google Maps Geocoding API error: ${response.data.status} - ${response.data.error_message}`);
      throw new ValidationError(`Geocoding failed: ${response.data.status}`);
    }

    const results = (response.data.results || []).map((result) => ({
      formatted_address: result.formatted_address,
      location: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      },
      place_id: result.place_id,
      types: result.types,
      address_components: result.address_components.map((component) => ({
        long_name: component.long_name,
        short_name: component.short_name,
        types: component.types,
      })),
      geometry: {
        location_type: result.geometry.location_type,
        viewport: result.geometry.viewport,
        bounds: result.geometry.bounds,
      },
    }));

    res.json({
      status: 'success',
      data: {
        results,
        status: response.data.status,
      },
    });
  } catch (error) {
    logger.error(`Geocode address error: ${error.message}`);
    if (error.response) {
      throw new ValidationError(`Google Maps API error: ${error.response.data?.error_message || error.message}`);
    }
    throw error;
  }
});

/**
 * Distance matrix - GET /api/maps/distance-matrix
 */
export const distanceMatrix = asyncHandler(async (req, res) => {
  const { origins, destinations, mode, units, avoid, departure_time, arrival_time } = req.query;

  if (!origins || !destinations) {
    throw new ValidationError('Origins and destinations are required');
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new ValidationError('Google Maps API key is not configured');
  }

  try {
    const params = {
      origins,
      destinations,
      key: GOOGLE_MAPS_API_KEY,
      mode: mode || 'driving',
      units: units || 'metric', // metric or imperial
    };

    if (avoid) {
      params.avoid = avoid;
    }

    if (departure_time) {
      params.departure_time = departure_time;
    }

    if (arrival_time) {
      params.arrival_time = arrival_time;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_BASE}/distancematrix/json`, { params });
    
    if (response.data.status !== 'OK') {
      logger.error(`Google Maps Distance Matrix API error: ${response.data.status} - ${response.data.error_message}`);
      throw new ValidationError(`Distance matrix failed: ${response.data.status}`);
    }

    const rows = (response.data.rows || []).map((row) => ({
      elements: row.elements.map((element) => ({
        distance: element.distance ? {
          value: element.distance.value, // meters
          text: element.distance.text,
        } : null,
        duration: element.duration ? {
          value: element.duration.value, // seconds
          text: element.duration.text,
        } : null,
        duration_in_traffic: element.duration_in_traffic ? {
          value: element.duration_in_traffic.value,
          text: element.duration_in_traffic.text,
        } : null,
        status: element.status,
      })),
    }));

    res.json({
      status: 'success',
      data: {
        origin_addresses: response.data.origin_addresses,
        destination_addresses: response.data.destination_addresses,
        rows,
        status: response.data.status,
      },
    });
  } catch (error) {
    logger.error(`Distance matrix error: ${error.message}`);
    if (error.response) {
      throw new ValidationError(`Google Maps API error: ${error.response.data?.error_message || error.message}`);
    }
    throw error;
  }
});
