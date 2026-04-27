/**
 * KEKE — Nigerian Cities Registry
 * Master list of cities: center, radius, tier. No active flag — which cities
 * are "live" is determined by data: getSeededCities(Place) returns cities
 * that have at least one place in MongoDB.
 */

export const NIGERIAN_CITIES = [
  { slug: 'lagos', name: 'Lagos', state: 'Lagos', center: { lat: 6.5000, lng: 3.4000 }, radiusKm: 45, tier: 1 },
  { slug: 'lagos-island', name: 'Lagos Island', state: 'Lagos', center: { lat: 6.4541, lng: 3.3947 }, radiusKm: 15, tier: 1 },
  { slug: 'lagos-mainland', name: 'Lagos Mainland', state: 'Lagos', center: { lat: 6.5244, lng: 3.3792 }, radiusKm: 20, tier: 1 },
  { slug: 'abuja', name: 'Abuja', state: 'FCT', center: { lat: 9.0765, lng: 7.3986 }, radiusKm: 25, tier: 1 },
  { slug: 'kano', name: 'Kano', state: 'Kano', center: { lat: 12.0022, lng: 8.5920 }, radiusKm: 20, tier: 1 },
  { slug: 'ibadan', name: 'Ibadan', state: 'Oyo', center: { lat: 7.3775, lng: 3.9470 }, radiusKm: 20, tier: 1 },
  { slug: 'port-harcourt', name: 'Port Harcourt', state: 'Rivers', center: { lat: 4.8156, lng: 7.0498 }, radiusKm: 18, tier: 1 },
  { slug: 'enugu', name: 'Enugu', state: 'Enugu', center: { lat: 6.4584, lng: 7.5464 }, radiusKm: 15, tier: 2 },
  { slug: 'onitsha', name: 'Onitsha', state: 'Anambra', center: { lat: 6.1453, lng: 6.7867 }, radiusKm: 12, tier: 2 },
  { slug: 'awka', name: 'Awka', state: 'Anambra', center: { lat: 6.2103, lng: 7.0715 }, radiusKm: 10, tier: 2 },
  { slug: 'nnewi', name: 'Nnewi', state: 'Anambra', center: { lat: 6.0069, lng: 6.9128 }, radiusKm: 10, tier: 2 },
  { slug: 'owerri', name: 'Owerri', state: 'Imo', center: { lat: 5.4836, lng: 7.0333 }, radiusKm: 12, tier: 2 },
  { slug: 'benin-city', name: 'Benin City', state: 'Edo', center: { lat: 6.3350, lng: 5.6037 }, radiusKm: 15, tier: 2 },
  { slug: 'warri', name: 'Warri', state: 'Delta', center: { lat: 5.5167, lng: 5.7500 }, radiusKm: 12, tier: 2 },
  { slug: 'asaba', name: 'Asaba', state: 'Delta', center: { lat: 6.1833, lng: 6.7333 }, radiusKm: 10, tier: 2 },
  { slug: 'calabar', name: 'Calabar', state: 'Cross River', center: { lat: 4.9517, lng: 8.3220 }, radiusKm: 12, tier: 2 },
  { slug: 'uyo', name: 'Uyo', state: 'Akwa Ibom', center: { lat: 5.0377, lng: 7.9128 }, radiusKm: 10, tier: 2 },
  { slug: 'jos', name: 'Jos', state: 'Plateau', center: { lat: 9.8965, lng: 8.8583 }, radiusKm: 12, tier: 2 },
  { slug: 'kaduna', name: 'Kaduna', state: 'Kaduna', center: { lat: 10.5264, lng: 7.4384 }, radiusKm: 15, tier: 2 },
  { slug: 'ilorin', name: 'Ilorin', state: 'Kwara', center: { lat: 8.4966, lng: 4.5421 }, radiusKm: 12, tier: 2 },
  { slug: 'akure', name: 'Akure', state: 'Ondo', center: { lat: 7.2526, lng: 5.1988 }, radiusKm: 10, tier: 2 },
  { slug: 'abeokuta', name: 'Abeokuta', state: 'Ogun', center: { lat: 7.1557, lng: 3.3452 }, radiusKm: 12, tier: 2 },
  { slug: 'abakaliki', name: 'Abakaliki', state: 'Ebonyi', center: { lat: 6.3350, lng: 8.1078 }, radiusKm: 10, tier: 3 },
  { slug: 'makurdi', name: 'Makurdi', state: 'Benue', center: { lat: 7.7308, lng: 8.5391 }, radiusKm: 10, tier: 3 },
  { slug: 'lafia', name: 'Lafia', state: 'Nasarawa', center: { lat: 8.4917, lng: 8.5167 }, radiusKm: 8, tier: 3 },
  { slug: 'lokoja', name: 'Lokoja', state: 'Kogi', center: { lat: 7.8069, lng: 6.7333 }, radiusKm: 8, tier: 3 },
  { slug: 'umuahia', name: 'Umuahia', state: 'Abia', center: { lat: 5.5133, lng: 7.4850 }, radiusKm: 8, tier: 3 },
  { slug: 'aba', name: 'Aba', state: 'Abia', center: { lat: 5.1085, lng: 7.3673 }, radiusKm: 10, tier: 3 },
  { slug: 'yenagoa', name: 'Yenagoa', state: 'Bayelsa', center: { lat: 4.9267, lng: 6.2676 }, radiusKm: 8, tier: 3 },
  { slug: 'minna', name: 'Minna', state: 'Niger', center: { lat: 9.6139, lng: 6.5569 }, radiusKm: 10, tier: 3 },
  { slug: 'sokoto', name: 'Sokoto', state: 'Sokoto', center: { lat: 13.0622, lng: 5.2339 }, radiusKm: 10, tier: 3 },
  { slug: 'zaria', name: 'Zaria', state: 'Kaduna', center: { lat: 11.1063, lng: 7.7195 }, radiusKm: 10, tier: 3 },
];

export function getCityBySlug(slug) {
  return NIGERIAN_CITIES.find(c => c.slug === slug) || null;
}

export function detectCity(lat, lng) {
  let closest = null;
  let closestDist = Infinity;
  for (const city of NIGERIAN_CITIES) {
    const dist = haversineKm(lat, lng, city.center.lat, city.center.lng);
    if (dist < city.radiusKm && dist < closestDist) {
      closestDist = dist;
      closest = city;
    }
  }
  return closest;
}

/**
 * Returns cities that have at least one place in MongoDB. Used for stats and
 * reports — a city "exists" as soon as it has data; no code/config change needed.
 * @param {import('mongoose').Model} placeModel - Place model (or any model with city field)
 * @returns {Promise<Array<{ slug: string, name: string, state: string, center: { lat: number, lng: number }, radiusKm: number, tier: number }>>}
 */
export async function getSeededCities(placeModel) {
  const slugs = await placeModel.distinct('city');
  return slugs
    .map((slug) => NIGERIAN_CITIES.find((c) => c.slug === slug))
    .filter(Boolean);
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
