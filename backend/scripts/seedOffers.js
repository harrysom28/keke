#!/usr/bin/env node

/**
 * Seed offers/promocodes script
 * Creates sample promotional offers for the app
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Promocode from '../src/models/Promocode.js';
import logger from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

// Sample offers to create
const sampleOffers = [
  {
    code: 'WELCOME20',
    description: 'Welcome offer! Get 20% off your first ride. Perfect for new users.',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscount: 500,
    minAmount: 500,
    maxUses: 1000,
    maxUsesPerUser: 1,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'SAVE500',
    description: 'Save ₦500 on rides over ₦2000. Great for longer trips!',
    discountType: 'fixed',
    discountValue: 500,
    maxDiscount: null,
    minAmount: 2000,
    maxUses: 500,
    maxUsesPerUser: 3,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'WEEKEND15',
    description: 'Weekend special! Enjoy 15% off on all weekend rides.',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscount: 1000,
    minAmount: 1000,
    maxUses: null, // Unlimited
    maxUsesPerUser: 5,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'FIRST100',
    description: 'First 100 users get ₦1000 off! Limited time offer.',
    discountType: 'fixed',
    discountValue: 1000,
    maxDiscount: null,
    minAmount: 1500,
    maxUses: 100,
    maxUsesPerUser: 1,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'RIDE25',
    description: 'Get 25% off on your next ride. Maximum discount of ₦750.',
    discountType: 'percentage',
    discountValue: 25,
    maxDiscount: 750,
    minAmount: 800,
    maxUses: 200,
    maxUsesPerUser: 2,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'NEWUSER',
    description: 'New user bonus! ₦300 off your first ride.',
    discountType: 'fixed',
    discountValue: 300,
    maxDiscount: null,
    minAmount: 500,
    maxUses: null, // Unlimited
    maxUsesPerUser: 1,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'LOYALTY10',
    description: 'Loyalty reward! 10% off for our regular customers.',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscount: 400,
    minAmount: 1000,
    maxUses: null, // Unlimited
    maxUsesPerUser: 10,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days from now
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
  {
    code: 'FLASH300',
    description: 'Flash sale! ₦300 off on all rides. Limited time only!',
    discountType: 'fixed',
    discountValue: 300,
    maxDiscount: null,
    minAmount: 600,
    maxUses: 300,
    maxUsesPerUser: 1,
    validFrom: new Date(),
    validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now (expires soon)
    applicableUserTypes: ['passenger', 'all'],
    applicableVehicleTypes: [],
    isActive: true,
  },
];

const seedOffers = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    let createdCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    for (const offerData of sampleOffers) {
      try {
        // Check if promocode already exists
        const existing = await Promocode.findOne({ code: offerData.code });
        
        if (existing) {
          logger.info(`⚠️  Promocode ${offerData.code} already exists. Skipping...`);
          skippedCount++;
          continue;
        }

        // Create new promocode
        const promocode = await Promocode.create(offerData);
        logger.info(`✅ Created promocode: ${promocode.code} - ${promocode.description}`);
        createdCount++;
      } catch (error) {
        logger.error(`❌ Error creating promocode ${offerData.code}: ${error.message}`);
      }
    }

    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('📊 Offers Seeding Summary:');
    logger.info(`   ✅ Created: ${createdCount}`);
    logger.info(`   ⚠️  Skipped (already exist): ${skippedCount}`);
    logger.info(`   📝 Total processed: ${sampleOffers.length}`);
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    // List all active promocodes
    const allPromocodes = await Promocode.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10);
    
    if (allPromocodes.length > 0) {
      logger.info('📋 Active Promocodes in database:');
      allPromocodes.forEach((promo) => {
        const discount = promo.discountType === 'percentage' 
          ? `${promo.discountValue}%` 
          : `₦${promo.discountValue}`;
        logger.info(`   • ${promo.code} - ${discount} off (${promo.description?.substring(0, 50)}...)`);
      });
    }

    await mongoose.connection.close();
    logger.info('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Error seeding offers: ${error.message}`);
    logger.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run seeding
seedOffers();
