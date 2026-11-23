#!/usr/bin/env node
/**
 * Regression guard for the Nov 2026 silent-demotion incident.
 *
 * The bug: POST /driver/create's Object.assign overwrote
 * verificationStatus / documentsVerified / isOnline / isAvailable on an
 * existing driver, demoting legacy approved drivers whenever the mobile app
 * re-hit the endpoint. The fix strips those four admin-owned keys from the
 * update payload before Object.assign.
 *
 * This script exercises the exact strip + assign logic on a stub, without
 * requiring Mongo. Keeps the guarantee auditable without a running DB.
 *
 *   node scripts/verifyCreateDriverProfileSafety.js
 */
import { writeSync } from 'node:fs';
const log = (line) => writeSync(2, `${line}\n`);

let passed = 0;
let failed = 0;
const check = (cond, msg) => {
  if (cond) { passed++; log(`  ok   ${msg}`); }
  else { failed++; log(`  FAIL ${msg}`); }
};
const eq = (a, b, msg) =>
  check(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// Simulates the production update logic AFTER the fix.
function applyDriverProfileUpdate(existingDriver, driverData) {
  const {
    verificationStatus: _vs,
    documentsVerified: _dv,
    isOnline: _io,
    isAvailable: _ia,
    ...updatableFields
  } = driverData;
  Object.assign(existingDriver, updatableFields);
  return existingDriver;
}

// Shape of driverData as createDriverProfile builds it for every call.
const freshDriverData = () => ({
  user: 'u1',
  licenseNumber: 'ABC-123',
  licenseExpiry: new Date('2027-01-01'),
  vehicleDetails: {
    make: 'Bajaj',
    model: 'RE',
    year: 2023,
    plateNumber: 'ABK-999-XY',
    color: 'Yellow',
    vehicleType: 'vt1',
  },
  documentsVerified: false,
  verificationStatus: 'pending',
  isOnline: false,
  isAvailable: false,
});

log('A. approved driver stays approved on resubmit');
{
  const driver = {
    verificationStatus: 'approved',
    documentsVerified: true,
    isOnline: true,
    isAvailable: true,
    rejectionReason: null,
    vehicleDetails: { plateNumber: 'OLD-111', make: 'OldMake' },
  };
  applyDriverProfileUpdate(driver, freshDriverData());
  eq(driver.verificationStatus, 'approved', 'verificationStatus unchanged');
  eq(driver.documentsVerified, true, 'documentsVerified unchanged');
  eq(driver.isOnline, true, 'isOnline unchanged');
  eq(driver.isAvailable, true, 'isAvailable unchanged');
  eq(driver.vehicleDetails.plateNumber, 'ABK-999-XY', 'plate was updated (expected)');
  eq(driver.licenseNumber, 'ABC-123', 'license was updated (expected)');
}

log('\nB. rejected driver stays rejected on resubmit — does NOT get recycled');
{
  const driver = {
    verificationStatus: 'rejected',
    documentsVerified: false,
    rejectionReason: 'Fake license',
    isOnline: false,
    isAvailable: false,
  };
  applyDriverProfileUpdate(driver, freshDriverData());
  eq(driver.verificationStatus, 'rejected', 'rejection sticks');
  eq(driver.rejectionReason, 'Fake license', 'rejection reason preserved');
}

log('\nC. pending driver stays pending — overwrite would be a no-op anyway');
{
  const driver = {
    verificationStatus: 'pending',
    documentsVerified: false,
    isOnline: false,
    isAvailable: false,
  };
  applyDriverProfileUpdate(driver, freshDriverData());
  eq(driver.verificationStatus, 'pending', 'still pending');
  eq(driver.documentsVerified, false, 'docs still false');
}

log('\nD. online approved driver stays online on resubmit');
{
  const driver = {
    verificationStatus: 'approved',
    documentsVerified: true,
    isOnline: true,
    isAvailable: true,
    onlineSessionStartedAt: new Date('2026-11-23T08:00:00Z'),
  };
  applyDriverProfileUpdate(driver, freshDriverData());
  eq(driver.isOnline, true, 'isOnline preserved');
  eq(driver.isAvailable, true, 'isAvailable preserved');
  check(driver.onlineSessionStartedAt != null, 'session start preserved');
}

log('\nE. updatable fields (vehicleDetails, licenseNumber, bankAccount) still write');
{
  const driver = {
    verificationStatus: 'approved',
    documentsVerified: true,
    isOnline: false,
    isAvailable: false,
    vehicleDetails: { plateNumber: 'OLD', make: 'Old' },
    licenseNumber: 'OLD-LIC',
    bankAccount: { accountNumber: '0000000000', verified: true },
  };
  const next = freshDriverData();
  next.bankAccount = { accountNumber: '1111111111' };
  applyDriverProfileUpdate(driver, next);
  eq(driver.vehicleDetails.plateNumber, 'ABK-999-XY', 'plate updated');
  eq(driver.vehicleDetails.make, 'Bajaj', 'make updated');
  eq(driver.licenseNumber, 'ABC-123', 'license updated');
  eq(driver.bankAccount.accountNumber, '1111111111', 'bank updated');
}

log('\nF. driverData with NO admin fields passes through cleanly');
{
  // In practice driverData always has the four keys, but the strip should be
  // safe even when they're absent (defensive).
  const driver = {
    verificationStatus: 'approved',
    documentsVerified: true,
    isOnline: true,
    isAvailable: true,
  };
  applyDriverProfileUpdate(driver, {
    licenseNumber: 'LIC-NEW',
    vehicleDetails: { plateNumber: 'NEW-XYZ' },
  });
  eq(driver.verificationStatus, 'approved', 'approval preserved');
  eq(driver.isOnline, true, 'online preserved');
  eq(driver.licenseNumber, 'LIC-NEW', 'license updated');
}

log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
