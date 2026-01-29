import express from 'express';
import * as uploadController from '../controllers/uploadController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// File upload routes
router.post('/user/profile/upload-image', uploadController.uploadProfileImage);
router.post('/driver/vehicle/upload-images', uploadController.uploadVehicleImages);
router.post('/driver/documents/upload', uploadController.uploadDriverDocuments);
router.post('/upload/file', uploadController.uploadFile);

export default router;
