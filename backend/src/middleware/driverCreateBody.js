/**
 * Normalize mobile driver registration form body to API shape.
 * Mobile sends: first_name, last_name, vehicle_year, vehicle_color, vehicle_model,
 * vehicle_type_id, licence_plate_number, union_number, etc.
 * API expects: licenseNumber, licenseExpiry, vehicleDetails.{ make, model, year, plateNumber, color, vehicleType }
 */
export function normalizeDriverCreateBody(req, res, next) {
  const b = req.body || {};
  // Already in API shape
  if (b.vehicleDetails && (b.licenseNumber || b.licenseExpiry)) {
    return next();
  }
  // Mobile form shape: flat fields
  const hasMobileShape =
    b.vehicle_year != null ||
    b.licence_plate_number != null ||
    b.union_number != null ||
    b.vehicle_type_id != null;
  if (!hasMobileShape) {
    return next();
  }

  const yearRaw = b.vehicle_year != null ? parseInt(String(b.vehicle_year), 10) : NaN;
  const yearVal = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const licenseExpiry =
    b.license_expiry ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  req.body = {
    ...req.body,
    licenseNumber: b.licenseNumber || b.union_number || b.licence_number || '',
    licenseExpiry: b.licenseExpiry || licenseExpiry,
    vehicleDetails: {
      make: b['vehicleDetails.make'] ?? b.vehicleDetails?.make ?? b.vehicle_make ?? b.vehicle_model ?? '',
      model: b['vehicleDetails.model'] ?? b.vehicleDetails?.model ?? b.vehicle_model ?? '',
      year: b['vehicleDetails.year'] ?? b.vehicleDetails?.year ?? yearVal,
      plateNumber: b['vehicleDetails.plateNumber'] ?? b.vehicleDetails?.plateNumber ?? b.licence_plate_number ?? '',
      color: b['vehicleDetails.color'] ?? b.vehicleDetails?.color ?? b.vehicle_color ?? '',
      vehicleType: b['vehicleDetails.vehicleType'] ?? b.vehicleDetails?.vehicleType ?? b.vehicle_type_id ?? '',
    },
  };
  next();
}
