/**
 * Normalize mobile driver registration form body to API shape.
 * Mobile sends: first_name, last_name, vehicle_year, vehicle_color, vehicle_model,
 * vehicle_type_id, licence_plate_number, union_number, etc.
 * API expects: licenseNumber, licenseExpiry, vehicleDetails.{ make, model, year, plateNumber, color, vehicleType }
 *
 * Multipart FormData from React Native appends nested fields as either:
 *   - bracket keys: vehicleDetails[make]
 *   - dotted keys:  vehicleDetails.make
 *   - or (rarely) a nested object if a body parser rebuilt them
 * Multer leaves bracket/dot keys as literal string keys — we must read all three.
 */
function firstDefined(...vals) {
  for (const v of vals) {
    if (v != null && v !== '') return v;
  }
  return undefined;
}

export function normalizeDriverCreateBody(req, res, next) {
  const b = req.body || {};
  // Already in API shape
  if (b.vehicleDetails && typeof b.vehicleDetails === 'object' && (b.licenseNumber || b.licenseExpiry)) {
    return next();
  }

  const bracketMake = b['vehicleDetails[make]'];
  const bracketModel = b['vehicleDetails[model]'];
  const bracketYear = b['vehicleDetails[year]'];
  const bracketPlate = b['vehicleDetails[plateNumber]'];
  const bracketColor = b['vehicleDetails[color]'];
  const bracketType = b['vehicleDetails[vehicleType]'];

  // Mobile form shape: flat fields and/or bracket-notation vehicleDetails[*]
  const hasMobileShape =
    b.vehicle_year != null ||
    b.licence_plate_number != null ||
    b.union_number != null ||
    b.vehicle_type_id != null ||
    bracketMake != null ||
    bracketPlate != null ||
    bracketType != null ||
    b['vehicleDetails.make'] != null ||
    b['vehicleDetails.plateNumber'] != null ||
    (b.vehicleDetails && typeof b.vehicleDetails === 'object');

  if (!hasMobileShape) {
    return next();
  }

  const yearCandidate = firstDefined(
    bracketYear,
    b['vehicleDetails.year'],
    b.vehicleDetails?.year,
    b.vehicle_year
  );
  const yearRaw = yearCandidate != null ? parseInt(String(yearCandidate), 10) : NaN;
  const yearVal = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const licenseExpiry =
    b.license_expiry ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  req.body = {
    ...req.body,
    licenseNumber: firstDefined(b.licenseNumber, b.union_number, b.licence_number) || '',
    licenseExpiry: firstDefined(b.licenseExpiry, licenseExpiry),
    vehicleDetails: {
      make:
        firstDefined(
          bracketMake,
          b['vehicleDetails.make'],
          b.vehicleDetails?.make,
          b.vehicle_make,
          b.vehicle_name,
          b.vehicle_model
        ) || '',
      model:
        firstDefined(
          bracketModel,
          b['vehicleDetails.model'],
          b.vehicleDetails?.model,
          b.vehicle_model
        ) || '',
      year: yearVal,
      plateNumber:
        firstDefined(
          bracketPlate,
          b['vehicleDetails.plateNumber'],
          b.vehicleDetails?.plateNumber,
          b.licence_plate_number
        ) || '',
      color:
        firstDefined(
          bracketColor,
          b['vehicleDetails.color'],
          b.vehicleDetails?.color,
          b.vehicle_color
        ) || '',
      vehicleType:
        firstDefined(
          bracketType,
          b['vehicleDetails.vehicleType'],
          b.vehicleDetails?.vehicleType,
          b.vehicle_type_id
        ) || '',
    },
  };
  next();
}
