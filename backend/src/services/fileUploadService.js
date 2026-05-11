import AWS from 'aws-sdk';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine upload provider (s3, cloudinary, or local)
const UPLOAD_PROVIDER = process.env.UPLOAD_PROVIDER || 'local'; // local, s3, cloudinary

// Configure AWS S3 if credentials provided
let s3 = null;
if (UPLOAD_PROVIDER === 's3' && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  });
  s3 = new AWS.S3();
}

// Configure Cloudinary if credentials provided
if (UPLOAD_PROVIDER === 'cloudinary' && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    timeout: parseInt(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || '120000', 10),
  });
}

// Allowed file types (include HEIC for iOS)
const allowedMimeTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/jpg,image/gif,image/heic,application/pdf')
  .split(',')
  .map((type) => type.trim());

// Maximum file size (5MB default)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10); // 5MB

/**
 * Get storage configuration based on provider
 */
const getStorage = () => {
  if (UPLOAD_PROVIDER === 's3' && s3) {
    // AWS S3 storage
    return multerS3({
      s3,
      bucket: process.env.AWS_S3_BUCKET_NAME || 'keke-uploads',
      acl: 'public-read',
      key: (req, file, cb) => {
        const fileType = file.fieldname || 'general';
        const uniqueName = `${fileType}/${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: (req, file, cb) => {
        cb(null, {
          fieldName: file.fieldname,
          originalName: file.originalname,
        });
      },
    });
  }

  if (UPLOAD_PROVIDER === 'cloudinary') {
    // Cloudinary storage (using multer memory storage + cloudinary upload)
    return multer.memoryStorage();
  }

  // Local filesystem storage (default)
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      const fileType = file.fieldname || 'general';
      const destPath = path.join(uploadsDir, fileType);
      
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      
      cb(null, destPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
};

// File filter
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
};

// Multer configuration
const upload = multer({
  storage: getStorage(),
  limits: {
    fileSize: maxFileSize,
  },
  fileFilter,
});

/**
 * Upload file to Cloudinary (if using Cloudinary)
 */
export const uploadToCloudinary = async (buffer, folder = 'general', options = {}) => {
  if (UPLOAD_PROVIDER !== 'cloudinary') {
    throw new Error('Cloudinary is not configured');
  }

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: `keke/${folder}`,
      resource_type: 'auto',
      ...options,
    };

    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary upload error: ${error.message}`);
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
          });
        }
      }
    ).end(buffer);
  });
};

/**
 * Stream a Readable into Cloudinary instead of buffering the whole file in
 * RAM. Caller is responsible for the lifetime of the source stream (e.g.
 * unlinking a multer temp file once this promise settles).
 *
 * Peak memory is bounded by the stream's internal highWaterMark (~64 KB by
 * default) rather than the full file size, which is what we need on the
 * driver /create path that uploads 4 files in parallel.
 */
export const uploadStreamToCloudinary = (readable, folder = 'general', options = {}) => {
  if (UPLOAD_PROVIDER !== 'cloudinary') {
    return Promise.reject(new Error('Cloudinary is not configured'));
  }

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: `keke/${folder}`,
      resource_type: 'auto',
      ...options,
    };

    const cldStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        logger.error(`Cloudinary upload error: ${error.message}`);
        return reject(error);
      }
      resolve({
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    });

    // Propagate read errors (missing temp file, permission, etc.) as a
    // rejection so the caller's try/catch in the Promise.all partition
    // logic sees them the same way it sees Cloudinary errors.
    readable.on('error', (err) => {
      cldStream.destroy(err);
      reject(err);
    });

    readable.pipe(cldStream);
  });
};

/**
 * Delete file from S3
 */
export const deleteFromS3 = async (key) => {
  if (!s3) {
    throw new Error('S3 is not configured');
  }

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME || 'keke-uploads',
    Key: key,
  };

  try {
    await s3.deleteObject(params).promise();
    logger.info(`File deleted from S3: ${key}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting file from S3: ${error.message}`);
    throw error;
  }
};

/**
 * Delete file from Cloudinary
 */
export const deleteFromCloudinary = async (publicId) => {
  if (UPLOAD_PROVIDER !== 'cloudinary') {
    throw new Error('Cloudinary is not configured');
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`File deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Error deleting file from Cloudinary: ${error.message}`);
    throw error;
  }
};

/**
 * Get file URL based on storage type
 */
export const getFileUrl = (file) => {
  if (file.location) {
    // S3 file
    return file.location;
  }
  
  if (file.key && s3) {
    // S3 file with key
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${file.key}`;
  }

  if (file.path) {
    // Local file - construct URL
    const baseUrl = process.env.API_BASE_URL;
    if (!baseUrl && process.env.NODE_ENV === 'production') {
      logger.error(
        'CRITICAL: API_BASE_URL is not set. Local file URLs will be inaccessible. Set API_BASE_URL to your public API origin.'
      );
    }
    const resolvedBase = baseUrl || 'http://localhost:8000';
    const relativePath = file.path.replace(/^.*uploads[\/\\]/, '/uploads/').replace(/\\/g, '/');
    return `${resolvedBase}${relativePath}`;
  }

  return file.url || null;
};

// Export multer upload functions
export const uploadSingle = (fieldName) => upload.single(fieldName);
export const uploadMultiple = (fieldName, maxCount = 5) => upload.array(fieldName, maxCount);
export const uploadFields = (fields) => upload.fields(fields);

// Error handler for multer errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        message: `File size exceeds maximum allowed size of ${maxFileSize / 1024 / 1024}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        status: 'error',
        message: 'Too many files uploaded',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        status: 'error',
        message: 'Unexpected file field',
      });
    }
  }

  if (err.message.includes('Invalid file type')) {
    return res.status(400).json({
      status: 'error',
      message: err.message,
    });
  }

  next(err);
};

export default upload;
