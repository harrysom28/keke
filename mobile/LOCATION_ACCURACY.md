# 📍 Location Accuracy Guide

## Issue: Location Not Precise

If the map is showing but location is not precise, here are solutions:

## 🔧 For Android Emulator

### Problem
Android emulators often use mock locations (like Google HQ: 37.4219983, -122.084) which may not be your actual location.

### Solution 1: Set Custom Location in Emulator

1. **Open emulator settings:**
   - Click the **⋮ (three dots)** button in the emulator toolbar
   - Select **Location**

2. **Set coordinates:**
   - Enter your desired latitude and longitude
   - Example for Nigeria: `9.082` (lat), `8.6753` (lng)
   - Click **Send**

### Solution 2: Use ADB Command

```bash
# Set location via command line (longitude first, then latitude)
# Example: Set to Lagos, Nigeria
adb emu geo fix 8.6753 9.082

# Example: Set to Abuja, Nigeria  
adb emu geo fix 7.4951 9.0579
```

### Solution 3: Enable GPS in Emulator

1. Open emulator **Settings** → **Location**
2. Enable **GPS satellites**
3. Set location manually or use ADB command above

## 📱 For Real Device

### Check Location Permissions

1. **Android Settings** → **Apps** → **Your App** → **Permissions**
2. Ensure **Location** permission is granted
3. For best accuracy, select **"Allow all the time"** or **"While using the app"**

### Enable High Accuracy Mode

1. **Android Settings** → **Location**
2. Ensure **Location** is **ON**
3. Tap **Mode** → Select **"High accuracy"** (uses GPS + WiFi + Mobile networks)

### Check Location Services

- Ensure **GPS** is enabled
- Ensure **WiFi** is enabled (helps with initial location)
- Ensure **Mobile data** is enabled (helps with location)

## 🛠️ Technical Details

The app now uses:
- **Accuracy**: `Location.Accuracy.BestForNavigation` (highest precision)
- **Update interval**: Every 5 seconds
- **Distance threshold**: Updates when device moves 5 meters
- **Accuracy threshold**: Only accepts locations with accuracy < 100m

## 📊 Checking Location Accuracy

The app logs location accuracy in the console:
```
📍 Location updated: {
  lat: 9.082,
  lng: 8.6753,
  accuracy: "15m",  // Lower is better (5-20m is excellent)
  altitude: 250
}
```

**Accuracy Guidelines:**
- **< 10m**: Excellent (GPS lock)
- **10-30m**: Good (GPS with some interference)
- **30-100m**: Fair (WiFi/cell tower location)
- **> 100m**: Poor (may be using cached/mock location)

## ⚠️ Common Issues

### Issue: Location shows Google HQ (37.42, -122.08)
**Solution**: This is the Android emulator's default mock location. Use ADB command or emulator settings to set your actual location.

### Issue: Accuracy is > 100m
**Solutions**:
1. Move to an area with better GPS signal (outdoors)
2. Enable WiFi (helps with initial location)
3. Wait a few seconds for GPS to lock
4. Check if device has GPS enabled

### Issue: Location not updating
**Solutions**:
1. Check location permissions
2. Restart location service in app
3. Check if device GPS is enabled
4. Try moving to an area with better signal

## 🧪 Testing Location

To test if location is working:

1. **Check console logs** for:
   ```
   📍 Current location fetched: { lat: X, lng: Y, accuracy: "Xm" }
   📍 Location updated: { lat: X, lng: Y, accuracy: "Xm" }
   ```

2. **Verify on map**: Your location should show a blue dot on the map

3. **Check accuracy**: Lower accuracy values (5-20m) indicate precise GPS location
