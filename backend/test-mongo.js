/**
 * Quick MongoDB connection test.
 * Run from terminal: cd backend && node test-mongo.js
 */
import './src/config/env.js';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keke';

mongoose
  .connect(uri)
  .then(() => {
    console.log('MongoDB Connected');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
