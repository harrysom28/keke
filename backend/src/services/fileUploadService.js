import AWS from 'aws-sdk';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
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
      // CRITICAL: see uploadStreamToCloudinary below for the long version.
      // tl;dr the Cloudinary SDK creates an INTERNAL Q deferred even when
      // you're only using the callback API. If the upload fails (network,
      // bad cloud_name, invalid signature, etc.) it rejects that deferred
      // — and since upload_stream returns the Writable, nothing can ever
      // .catch it. Node then escalates to unhandledRejection. We saw this
      // in production: `Invalid cloud_name keke-cloudinary` from a
      // misconfigured env crashed the entire container. Disabling the
      // internal promise route makes the SDK use the callback path
      // exclusively, which we already handle.
      disable_promises: true,
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
 *
 * Error-handling notes — this used to crash the entire process under load:
 *  - The previous version used a plain `readable.pipe(cldStream)`. With raw
 *    `.pipe()`, an `'error'` event on the destination stream (e.g. when
 *    Cloudinary's underlying https.request errors mid-body) is NOT forwarded
 *    to the source, and if no one is listening on the destination's error
 *    channel the EventEmitter contract escalates it to `uncaughtException`.
 *    The server's global `handleUncaughtException` calls `process.exit(1)`,
 *    Docker restarts the container, and Traefik returns 502 for the in-flight
 *    request AND any other request that lands during the restart window —
 *    which is exactly the symptom we were seeing on /driver/create.
 *  - `stream/promises#pipeline` solves this: it attaches error listeners on
 *    every stage of the chain and surfaces them as a single promise rejection.
 *  - The Cloudinary callback can still fire after the pipeline settles (with
 *    either a payload or a Cloudinary-API error). The `settled` guard ensures
 *    we never double-resolve/reject.
 *  - The whole executor body is wrapped in try/catch so a synchronous throw
 *    from `cloudinary.uploader.upload_stream` (e.g. options-validation error
 *    when the SDK isn't configured) is converted into a rejection instead of
 *    escaping the Promise constructor.
 */
export const uploadStreamToCloudinary = (readable, folder = 'general', options = {}) => {
  if (UPLOAD_PROVIDER !== 'cloudinary') {
    return Promise.reject(new Error('Cloudinary is not configured'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(err?.message || String(err)));
    };

    try {
      const uploadOptions = {
        folder: `keke/${folder}`,
        resource_type: 'auto',
        // CRITICAL — read before touching:
        //
        // cloudinary v2's `call_api` (lib-es5/uploader.js ~L553) ALWAYS
        // creates a Q deferred internally:
        //   var deferred = Q.defer();
        //   ...
        //   if (USE_PROMISES) deferred.reject(res);
        //
        // `upload_stream` then returns the Writable stream (not the
        // promise), so there is NO way for caller code to .catch the
        // deferred. When the upload fails — bad cloud_name, network blip,
        // invalid signature, anything — Cloudinary rejects an internal
        // promise NOBODY can observe, Node emits unhandledRejection, and
        // (because the runtime treats an unhandled rejection without a
        // .catch as a fatal-ish event in some configurations) the process
        // exits 1. We confirmed this on the VPS: `Invalid cloud_name
        // keke-cloudinary` -> unhandledRejection -> process.exit(1) inside
        // 1 ms, tearing the container down on every /driver/create submit.
        //
        // `disable_promises: true` flips `USE_PROMISES` to false in the
        // SDK, so the deferred is created but never rejected. We still
        // get the error via the callback below, which routes through our
        // safeReject and the controller's per-file try/catch — the clean
        // path we already designed for.
        disable_promises: true,
        ...options,
      };

      const cldStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          logger.error(
            `Cloudinary upload error: ${error.message || error.http_code || JSON.stringify(error)}`
          );
          return safeReject(error);
        }
        if (!result?.secure_url) {
          return safeReject(new Error('Cloudinary returned no secure_url'));
        }
        safeResolve({
          url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      });

      pipeline(readable, cldStream).catch((err) => {
        logger.error(`Driver upload stream pipeline error: ${err?.message || err}`);
        safeReject(err);
      });
    } catch (err) {
      // Sync throw during stream setup (e.g. Cloudinary SDK option-validation
      // if cloud_name is unset). Without this, the throw would escape the
      // Promise executor and trip `uncaughtException`.
      logger.error(`uploadStreamToCloudinary setup error: ${err?.message || err}`);
      safeReject(err);
    }
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
