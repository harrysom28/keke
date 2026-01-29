import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allowed file types
const allowedMimeTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/jpg,application/pdf')
  .split(',')
  .map((type) => type.trim());

// Maximum file size (5MB default)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration for local filesystem
const storage = multer.diskStorage({
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
  storage,
  limits: {
    fileSize: maxFileSize,
  },
  fileFilter,
});

// Upload middleware for different use cases
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
