# Keke Mapping Architecture Migration

This document describes the migration from Google Maps to an open-source mapping stack optimized for African mobility markets.

## Architecture Overview

| Component        | Before              | After                         |
|-----------------|---------------------|-------------------------------|
| Map rendering   | Google Maps SDK     | Mapbox SDK (`@rnmapbox/maps`) |
| Map data        | Google              | OpenStreetMap                 |
| Routing         | Google Directions   | OSRM                          |
| Geocoding       | Google Geocoding   | Nominatim                     |
| Places search   | Google Places       | Nominatim                     |
| Distance matrix | Google Distance     | OSRM route API                |
| Driver location| MongoDB only        | Redis GEO + MongoDB           |
| Dispatch        | MongoDB geospatial  | Micro-grid + Redis GEORADIUS  |

## Backend Services

### 1. OSRM Routing Service (`backend/src/services/osrmRoutingService.js`)

- **Endpoint**: `OSRM_URL/route/v1/driving/{lng1},{lat1};{lng2},{lat2}`
- **Redis cache**: 6-hour TTL, key format `originLat_originLng_destLat_destLng`
- **Response**: distance, duration, geometry, encoded polyline

**Setup**: Run OSRM with Nigeria OSM extract:

```bash
# Download Nigeria OSM (Geofabrik)
wget https://download.geofabrik.de/africa/nigeria-latest.osm.pbf

# Process and run
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/nigeria-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/nigeria-latest.osrm
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-routed /data/nigeria-latest.osrm --port 5000
```

### 2. Location Service (`backend/src/services/locationService.js`)

- **Redis GEO**: `GEOADD driver_locations lon lat driverId`
- **Query**: `GEORADIUS driver_locations lon lat 2 km ASC COUNT 10`
- **MongoDB fallback**: When Redis unavailable, uses `Driver.findNearbyAvailable`

### 3. Dispatch Service (`backend/src/services/dispatchService.js`)

Micro-grid algorithm (~500m blocks):

1. Rider requests → pickup grid determined
2. Search drivers in same grid (0.5km)
3. Expand to adjacent grids (1.5km) if none found
4. Fallback to 5km radius

ETA: `distance / 25 km/h` (configurable `AVERAGE_SPEED_KMH`)

### 4. Nominatim Geocoding (`backend/src/services/nominatimGeocodingService.js`)

- **Rate limit**: 1 req/sec (public Nominatim policy)
- **Redis cache**: 24h for geocode, 90s for search
- **Endpoints**: geocode, reverseGeocode, searchPlaces, getPlaceDetails

## MongoDB Schemas

### Driver

```javascript
{
  currentLocation: {
    type: 'Point',
    coordinates: [longitude, latitude]
  }
}
// Index: db.drivers.createIndex({ currentLocation: "2dsphere" })
```

### Ride/Trip

Status flow: `requested` → `accepted` → `arrived` → `in-progress` → `completed`

## Mobile Changes

### Driver location throttle

- **Before**: 10 seconds  
- **After**: 4.5 seconds (optimized for low-end Android)

### Navigation deep link

- **Button**: "Navigate" in driver ride sheet
- **URL**: `google.navigation:q=lat,lng` (Android)
- **Fallback**: `https://www.google.com/maps/dir/?api=1&destination=lat,lng`

### Mapbox migration

`@rnmapbox/maps` is installed. To activate:

1. Create Mapbox account → get token at https://account.mapbox.com
2. Add to `app.config.js`: `extra: { MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN }`
3. Add to `.env`: `MAPBOX_ACCESS_TOKEN=pk.xxx`
4. Run `npx expo prebuild` (Mapbox requires custom native code)
5. Replace in map screens:
   - `MapView` from `react-native-maps` → `MapView` from `@rnmapbox/maps`
   - `Marker` → `PointAnnotation`
   - `Polyline` → `ShapeSource` + `LineLayer`
6. Remove `PROVIDER_GOOGLE` and Google Maps config from iOS/Android

## Environment Variables

```env
# Backend
OSRM_URL=http://localhost:5000
REDIS_HOST=localhost

# Mobile (when using Mapbox)
MAPBOX_ACCESS_TOKEN=pk.xxx
```

## Cost Comparison

- **Google Maps**: ~$7 per 1,000 directions, $5 per 1,000 geocodes, $10 per 1,000 Places
- **OSRM + Nominatim**: Self-hosted = infrastructure cost only; public Nominatim = free (rate limited)

Estimated **>90% cost reduction** for mapping infrastructure.
