#!/bin/bash

# Clean start script for Expo
# This script clears all caches and starts Expo in Expo Go mode

echo "🧹 Cleaning caches..."

# Clear npm cache
echo "  - Clearing npm cache..."
npm cache clean --force 2>/dev/null || true

# Clear Expo caches
echo "  - Clearing Expo cache..."
rm -rf ~/.expo/cache/* 2>/dev/null || true
rm -rf .expo 2>/dev/null || true

# Clear Android emulator cache if connected
if adb devices | grep -q "device$"; then
    echo "  - Clearing Android emulator cache..."
    adb shell pm clear host.exp.exponent 2>/dev/null || true
fi

# Clear build caches
echo "  - Clearing build caches..."
rm -rf android/build 2>/dev/null || true
rm -rf ios/build 2>/dev/null || true

echo ""
echo "✅ Caches cleared!"
echo ""
echo "🚀 Starting Expo in Expo Go mode..."
echo ""
echo "📱 When the QR code appears:"
echo "   1. Press 's' to switch to Expo Go (if needed)"
echo "   2. Press 'a' to open on Android"
echo "   3. Or manually open Expo Go and enter the URL"
echo ""

# Start Expo with cache clearing and in Expo Go mode
npx expo start --clear --go
