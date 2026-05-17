import VehicleType from '../models/VehicleType.js';
import Driver from '../models/Driver.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Get vehicle types - GET /api/vehicle/types
 */
export const getVehicleTypes = asyncHandler(async (req, res) => {
  // For driver registration, return all active vehicle types
  // For riders, this can be filtered by area availability (future enhancement)
  const vehicleTypes = await VehicleType.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .select('-models -colors -years'); // Exclude arrays for list view

  res.json({
    status: 'success',
    data: vehicleTypes.map((type) => formatVehicleTypeResponse(type)),
  });
});

/**
 * Get vehicle colors - GET /api/vehicle/colours
 */
export const getVehicleColors = asyncHandler(async (req, res) => {
  const { vehicleTypeId } = req.query;

  if (vehicleTypeId) {
    // Get colors for specific vehicle type
    const vehicleType = await VehicleType.findById(vehicleTypeId);
    if (!vehicleType) {
      throw new NotFoundError('Vehicle type');
    }

    const colors = vehicleType.getActiveColors();

    return res.json({
      status: 'success',
      data: {
        colors: colors.map((color) => ({
          name: color.name,
          code: color.code,
        })),
      },
    });
  }

  // Get all unique colors across all vehicle types
  const allVehicleTypes = await VehicleType.find({ isActive: true });
  const colorMap = new Map();

  allVehicleTypes.forEach((type) => {
    type.getActiveColors().forEach((color) => {
      if (!colorMap.has(color.name)) {
        colorMap.set(color.name, {
          name: color.name,
          code: color.code,
        });
      }
    });
  });

  const colors = Array.from(colorMap.values());

  res.json({
    status: 'success',
    data: {
      colors,
    },
  });
});

/**
 * Get vehicle models - GET /api/vehicle/models
 */
export const getVehicleModels = asyncHandler(async (req, res) => {
  const { vehicleTypeId, make } = req.query;

  if (vehicleTypeId) {
    // Get models for specific vehicle type
    const vehicleType = await VehicleType.findById(vehicleTypeId);
    if (!vehicleType) {
      throw new NotFoundError('Vehicle type');
    }

    let models = vehicleType.getActiveModels();

    // Filter by make if provided
    if (make) {
      models = models.filter((model) => model.make.toLowerCase() === make.toLowerCase());
    }

    // Group by make
    const groupedModels = models.reduce((acc, model) => {
      const makeName = model.make;
      if (!acc[makeName]) {
        acc[makeName] = [];
      }
      acc[makeName].push({
        name: model.name,
        make: model.make,
        year: model.year,
      });
      return acc;
    }, {});

    return res.json({
      status: 'success',
      data: {
        models: groupedModels,
        makes: Object.keys(groupedModels).sort(),
      },
    });
  }

  // Get all unique models across all vehicle types
  const allVehicleTypes = await VehicleType.find({ isActive: true });
  const modelMap = new Map();

  allVehicleTypes.forEach((type) => {
    type.getActiveModels().forEach((model) => {
      const key = `${model.make}-${model.name}`;
      if (!modelMap.has(key)) {
        modelMap.set(key, {
          name: model.name,
          make: model.make,
          year: model.year,
        });
      }
    });
  });

  const models = Array.from(modelMap.values());

  // Group by make
  const groupedModels = models.reduce((acc, model) => {
    const makeName = model.make;
    if (!acc[makeName]) {
      acc[makeName] = [];
    }
    acc[makeName].push(model);
    return acc;
  }, {});

  res.json({
    status: 'success',
    data: {
      models: groupedModels,
      makes: Object.keys(groupedModels).sort(),
    },
  });
});

/**
 * Default year range when a vehicle type has no years configured (e.g. current year back to 15 years).
 * Used so driver registration always has a years list.
 */
const DEFAULT_YEARS_RANGE = 15;
const getDefaultYears = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: DEFAULT_YEARS_RANGE + 1 }, (_, i) => currentYear - i);
};

/**
 * Get vehicle years - GET /api/vehicle/years
 * Returns years for driver registration. Uses vehicle type's configured years, or a default range (current year back 15 years).
 */
export const getVehicleYears = asyncHandler(async (req, res) => {
  const { vehicleTypeId } = req.query;

  if (vehicleTypeId) {
    // Get years for specific vehicle type
    const vehicleType = await VehicleType.findById(vehicleTypeId);
    if (!vehicleType) {
      throw new NotFoundError('Vehicle type');
    }

    let years = vehicleType.getActiveYears && vehicleType.getActiveYears();
    if (!years || !Array.isArray(years) || years.length === 0) {
      years = getDefaultYears();
    }

    return res.json({
      status: 'success',
      data: {
        years,
      },
    });
  }

  // No vehicleTypeId: return all unique years from vehicle types, or default range
  const allVehicleTypes = await VehicleType.find({ isActive: true });
  const yearSet = new Set();

  allVehicleTypes.forEach((type) => {
    const typeYears = type.getActiveYears && type.getActiveYears();
    if (typeYears && typeYears.length) {
      typeYears.forEach((year) => yearSet.add(year));
    }
  });

  const years =
    yearSet.size > 0
      ? Array.from(yearSet).sort((a, b) => b - a)
      : getDefaultYears();

  res.json({
    status: 'success',
    data: {
      years,
    },
  });
});

/**
 * Get vehicle makes - GET /api/vehicle/makes (helper endpoint)
 */
export const getVehicleMakes = asyncHandler(async (req, res) => {
  const { vehicleTypeId } = req.query;

  if (vehicleTypeId) {
    // Get makes for specific vehicle type
    const vehicleType = await VehicleType.findById(vehicleTypeId);
    if (!vehicleType) {
      throw new NotFoundError('Vehicle type');
    }

    const models = vehicleType.getActiveModels();
    const makes = [...new Set(models.map((model) => model.make))].sort();

    return res.json({
      status: 'success',
      data: {
        makes,
      },
    });
  }

  // Get all unique makes across all vehicle types
  const allVehicleTypes = await VehicleType.find({ isActive: true });
  const makeSet = new Set();

  allVehicleTypes.forEach((type) => {
    type.getActiveModels().forEach((model) => {
      makeSet.add(model.make);
    });
  });

  const makes = Array.from(makeSet).sort();

  res.json({
    status: 'success',
    data: {
      makes,
    },
  });
});

/**
 * Format vehicle type response
 */
const formatVehicleTypeResponse = (type) => {
  return {
    vehicle_id: type._id.toString(),
    name: type.name,
    display_name: type.displayName,
    vehicle_type: type.displayName, // For backward compatibility
    description: type.description,
    image: type.image,
    icon: type.icon,
    base_fare: type.baseFare,
    per_km_rate: type.perKmRate,
    per_minute_rate: type.perMinuteRate,
    minimum_fare: type.minimumFare ?? null,
    multiplier: type.multiplier,
    capacity: type.capacity,
    is_active: type.isActive,
    order: type.order,
  };
};
