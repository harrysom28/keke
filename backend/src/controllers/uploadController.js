import { uploadSingle, uploadMultiple, uploadFields, handleUploadError, getFileUrl, uploadToCloudinary } from '../services/fileUploadService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import Driver from '../models/Driver.js';
import User from '../models/User.js';

/**
 * Upload profile image - POST /api/user/profile/upload-image
 */
export const uploadProfileImage = [
  uploadSingle('image'),
  handleUploadError,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    let fileUrl = getFileUrl(req.file);

    // If using Cloudinary, upload from buffer
    if (process.env.UPLOAD_PROVIDER === 'cloudinary' && req.file.buffer) {
      const cloudinaryResult = await uploadToCloudinary(req.file.buffer, 'profile-images', {
        transformation: [{ width: 500, height: 500, crop: 'fill', quality: 'auto' }],
      });
      fileUrl = cloudinaryResult.url;
    }

    // Update user profile image
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    user.profileImage = fileUrl;
    await user.save();

    logger.info(`Profile image uploaded for user ${userId}`);

    res.json({
      status: 'success',
      message: 'Profile image uploaded successfully',
      data: {
        image_url: fileUrl,
      },
    });
  }),
];

/**
 * Upload driver vehicle images - POST /api/driver/vehicle/upload-images
 */
export const uploadVehicleImages = [
  uploadMultiple('images', 10),
  handleUploadError,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!req.files || req.files.length === 0) {
      throw new ValidationError('At least one vehicle image is required');
    }

    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      throw new NotFoundError('Driver profile');
    }

    const vehicleImages = [];

    for (const file of req.files) {
      let fileUrl = getFileUrl(file);

      // If using Cloudinary, upload from buffer
      if (process.env.UPLOAD_PROVIDER === 'cloudinary' && file.buffer) {
        const cloudinaryResult = await uploadToCloudinary(file.buffer, 'vehicle-images', {
          transformation: [{ width: 800, height: 600, crop: 'limit', quality: 'auto' }],
        });
        fileUrl = cloudinaryResult.url;
      }

      // Determine image type from field name or filename
      const imageType = file.fieldname?.replace('images_', '') || 'general';
      const validTypes = ['front', 'back', 'side', 'interior', 'license'];

      vehicleImages.push({
        type: validTypes.includes(imageType) ? imageType : 'general',
        url: fileUrl,
        createdAt: new Date(),
      });
    }

    // Update driver vehicle images
    driver.vehicleImages = [...(driver.vehicleImages || []), ...vehicleImages];
    await driver.save();

    logger.info(`${vehicleImages.length} vehicle images uploaded for driver ${driver._id}`);

    res.json({
      status: 'success',
      message: 'Vehicle images uploaded successfully',
      data: {
        vehicle_images: vehicleImages,
        total_images: driver.vehicleImages.length,
      },
    });
  }),
];

/**
 * Upload driver documents - POST /api/driver/documents/upload
 */
export const uploadDriverDocuments = [
  uploadFields([
    { name: 'license', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'registration', maxCount: 1 },
  ]),
  handleUploadError,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!req.files || Object.keys(req.files).length === 0) {
      throw new ValidationError('At least one document is required');
    }

    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      throw new NotFoundError('Driver profile');
    }

    const uploadedDocuments = {};

    // Process license document
    if (req.files.license && req.files.license[0]) {
      let fileUrl = getFileUrl(req.files.license[0]);
      if (process.env.UPLOAD_PROVIDER === 'cloudinary' && req.files.license[0].buffer) {
        const result = await uploadToCloudinary(req.files.license[0].buffer, 'driver-documents', {});
        fileUrl = result.url;
      }
      uploadedDocuments.license = fileUrl;
      // Add to vehicle images as license type
      if (!driver.vehicleImages) driver.vehicleImages = [];
      driver.vehicleImages.push({
        type: 'license',
        url: fileUrl,
        createdAt: new Date(),
      });
    }

    // Process insurance document
    if (req.files.insurance && req.files.insurance[0]) {
      let fileUrl = getFileUrl(req.files.insurance[0]);
      if (process.env.UPLOAD_PROVIDER === 'cloudinary' && req.files.insurance[0].buffer) {
        const result = await uploadToCloudinary(req.files.insurance[0].buffer, 'driver-documents', {});
        fileUrl = result.url;
      }
      uploadedDocuments.insurance = fileUrl;
      if (driver.insurance) {
        driver.insurance.documentUrl = fileUrl;
      } else {
        driver.insurance = { documentUrl: fileUrl };
      }
    }

    // Process registration document
    if (req.files.registration && req.files.registration[0]) {
      let fileUrl = getFileUrl(req.files.registration[0]);
      if (process.env.UPLOAD_PROVIDER === 'cloudinary' && req.files.registration[0].buffer) {
        const result = await uploadToCloudinary(req.files.registration[0].buffer, 'driver-documents', {});
        fileUrl = result.url;
      }
      uploadedDocuments.registration = fileUrl;
    }

    await driver.save();

    logger.info(`Driver documents uploaded for driver ${driver._id}`);

    res.json({
      status: 'success',
      message: 'Driver documents uploaded successfully',
      data: {
        documents: uploadedDocuments,
      },
    });
  }),
];

/**
 * Upload generic file - POST /api/upload/file
 */
export const uploadFile = [
  uploadSingle('file'),
  handleUploadError,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('File is required');
    }

    let fileUrl = getFileUrl(req.file);

    // If using Cloudinary, upload from buffer
    if (process.env.UPLOAD_PROVIDER === 'cloudinary' && req.file.buffer) {
      const folder = req.body.folder || 'general';
      const cloudinaryResult = await uploadToCloudinary(req.file.buffer, folder, {});
      fileUrl = cloudinaryResult.url;
    }

    logger.info(`File uploaded: ${fileUrl}`);

    res.json({
      status: 'success',
      message: 'File uploaded successfully',
      data: {
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
      },
    });
  }),
];
