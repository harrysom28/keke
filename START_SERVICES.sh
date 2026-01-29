#!/bin/bash

# Start Backend Server
echo "🚀 Starting Backend Server..."
cd backend
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
cd ..

# Wait for backend to start
sleep 3

# Start Mobile App (Expo)
echo "📱 Starting Mobile App (Expo)..."
cd mobile
npx expo start --port 8081 > ../expo.log 2>&1 &
EXPO_PID=$!
echo "Expo PID: $EXPO_PID"
cd ..

echo ""
echo "✅ Services starting!"
echo "Backend: http://localhost:8000"
echo "Expo: http://localhost:8081"
echo ""
echo "Check logs:"
echo "  Backend: tail -f backend.log"
echo "  Expo: tail -f expo.log"
echo ""
echo "To stop services:"
echo "  kill $BACKEND_PID $EXPO_PID"
