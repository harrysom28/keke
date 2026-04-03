#!/usr/bin/env node
/**
 * KEKE — Seed places for Nigerian cities.
 * Default: all cities that have seed data in cityPlaces.js.
 * Run from backend: node scripts/seedAllCities.js [--dry-run] [--city enugu] [--all]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Place from '../src/models/Place.js';
import { CITY_PLACES } from '../src/seeds/cityPlaces.js';
import { NIGERIAN_CITIES } from '../src/seeds/nigerianCities.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke';

async function seedCity(citySlug, dryRun = false) {
  const cityConfig = NIGERIAN_CITIES.find((c) => c.slug === citySlug);
  if (!cityConfig) {
    console.error(`❌ Unknown city: ${citySlug}`);
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  const places = CITY_PLACES[citySlug];
  if (!places || places.length === 0) {
    console.warn(`⚠️  No seed data for: ${citySlug}`);
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  let inserted = 0,
    skipped = 0,
    errors = 0;

  for (const place of places) {
    try {
      const doc = {
        name: place.name,
        aliases: place.aliases ?? [],
        category: place.category,
        city: citySlug,
        state: cityConfig.state,
        location: { type: 'Point', coordinates: place.coords },
        source: 'seeded',
        popularity: place.popularity ?? 5,
        verified: true,
        active: true,
      };

      if (dryRun) {
        console.log(`  [DRY RUN] Would upsert: "${place.name}" (${citySlug})`);
        inserted++;
        continue;
      }

      const result = await Place.findOneAndUpdate(
        { name: place.name, city: citySlug },
        {
          $set: { ...doc, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date(), rideCount: 0 },
        },
        { upsert: true, new: true }
      );

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ❌ Error seeding "${place.name}": ${err.message}`);
      errors++;
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const seedAll = args.includes('--all');
  const cityArg =
    args.find((a) => a.startsWith('--city='))?.split('=')[1] ||
    (args.indexOf('--city') > -1 ? args[args.indexOf('--city') + 1] : null);

  console.log('\n🌍 KEKE — Nigerian Cities Place Seeder');
  console.log('═'.repeat(50));
  if (dryRun) console.log('🔍 DRY RUN MODE — no data will be written\n');

  if (!dryRun) {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    await Place.createIndexes();
    console.log('✅ Indexes created\n');
  }

  const citiesToSeed = cityArg
    ? [cityArg]
    : Object.keys(CITY_PLACES);

  console.log(`📋 Cities to seed: ${citiesToSeed.join(', ')}\n`);

  let totalInserted = 0,
    totalSkipped = 0,
    totalErrors = 0;

  for (const citySlug of citiesToSeed) {
    const cityConfig = NIGERIAN_CITIES.find((c) => c.slug === citySlug);
    const placesCount = CITY_PLACES[citySlug]?.length ?? 0;

    if (placesCount === 0) {
      console.log(`⚠️  ${citySlug}: no seed data available — skipping`);
      continue;
    }

    process.stdout.write(`📍 Seeding ${cityConfig?.name ?? citySlug} (${placesCount} places)... `);

    const { inserted, skipped, errors } = await seedCity(citySlug, dryRun);
    totalInserted += inserted;
    totalSkipped += skipped;
    totalErrors += errors;

    console.log(`✅ ${inserted} new, ${skipped} updated, ${errors} errors`);
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 TOTAL: ${totalInserted} new | ${totalSkipped} updated | ${totalErrors} errors`);

  if (!dryRun) {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
