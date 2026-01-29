import express from 'express';
import * as vehicleController from '../controllers/vehicleController.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// Vehicle management routes (public or protected based on requirements)
// These are typically public endpoints for the mobile app to fetch vehicle data

router.get('/types', vehicleController.getVehicleTypes);
router.get('/colours', vehicleController.getVehicleColors);
router.get('/colors', vehicleController.getVehicleColors); // Alias for US spelling
router.get('/models', vehicleController.getVehicleModels);
router.get('/years', vehicleController.getVehicleYears);
router.get('/makes', vehicleController.getVehicleMakes); // Helper endpoint

export default router;
