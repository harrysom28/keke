#!/bin/bash

# Build Development Build for Android
# This script sets up the environment and builds the app

echo "🔧 Setting up Android build environment..."

# Set JAVA_HOME to Android Studio's JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Set ANDROID_HOME
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"

echo "✅ JAVA_HOME: $JAVA_HOME"
echo "✅ ANDROID_HOME: $ANDROID_HOME"
echo ""

# Verify Java
echo "☕ Java version:"
java -version 2>&1 | head -3
echo ""

# Verify Android SDK
echo "🤖 Android SDK:"
ls "$ANDROID_HOME/platforms" 2>/dev/null | head -3
echo ""

# Check emulator
echo "📱 Android emulator:"
adb devices
echo ""

echo "🚀 Starting development build..."
echo "⏱️  This will take 10-15 minutes on first build..."
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf android/build
rm -rf android/app/build

# Run the build
echo "🔨 Building and installing app..."
npx expo run:android

echo ""
echo "✅ Build complete!"
