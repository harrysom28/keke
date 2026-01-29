import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const fixPhoneIndex = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Get existing indexes
    const indexes = await collection.indexes();
    logger.info('Current indexes:', indexes.map(idx => idx.name));

    // Drop the existing phone index if it exists
    try {
      await collection.dropIndex('phone_1');
      logger.info('✅ Dropped existing phone_1 index');
    } catch (err) {
      if (err.code === 27) {
        logger.info('ℹ️  phone_1 index does not exist, skipping drop');
      } else {
        throw err;
      }
    }

    // Create sparse unique index on phone
    await collection.createIndex(
      { phone: 1 },
      { 
        unique: true, 
        sparse: true,
        name: 'phone_1'
      }
    );
    logger.info('✅ Created sparse unique index on phone field');

    // Verify the index
    const newIndexes = await collection.indexes();
    const phoneIndex = newIndexes.find(idx => idx.name === 'phone_1');
    logger.info('Phone index details:', JSON.stringify(phoneIndex, null, 2));

    await mongoose.connection.close();
    logger.info('✅ Database connection closed');
    logger.info('\n═══════════════════════════════════════════════════════');
    logger.info('✅ Phone index fixed successfully!');
    logger.info('   - Multiple users can now have phone: null');
    logger.info('   - Phone numbers remain unique when provided');
    logger.info('═══════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Error fixing phone index: ${error.message}`);
    logger.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

fixPhoneIndex();
