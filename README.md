# Keke - Ride-Hailing Application

A complete ride-hailing application with mobile app and backend API.

## Project Structure

```
keke/
├── backend/          # Node.js/Express Backend API
└── mobile/           # React Native Mobile App (Expo)
```

## Quick Start

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration (MongoDB URI, JWT secrets, etc.)

# Initialize database (creates admin user and vehicle types)
npm run init:db

# Start development server
npm run dev
```

The backend will run on `http://localhost:8000`

### Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# For iOS
npm run ios

# For Android
npm run android
```

## Development Notes

### API URL Configuration

The mobile app is configured to connect to the backend at:
- **Android Emulator**: `http://10.0.2.2:8000` (default)
- **iOS Simulator / Physical Device**: Update in `mobile/utils/apiUrlOverride.ts` or `mobile/app.json`

The backend runs on port `8000` by default.

### Important Paths

- Backend API: `http://localhost:8000/api`
- Health Check: `http://localhost:8000/api/health`
- Public Config: `http://localhost:8000/api/config/public`

## Environment Variables

### Backend (.env)

See `backend/.env.example` for all required environment variables. Key ones:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens
- `GOOGLE_MAPS_API_KEY` - Google Maps API key
- `PORT` - Server port (default: 8000)

### Mobile App

Update `mobile/app.json` or `mobile/utils/apiUrlOverride.ts` for API URL configuration.

## Features

### Backend
- ✅ JWT Authentication with refresh tokens
- ✅ OTP verification system
- ✅ User & Driver management
- ✅ Ride management
- ✅ Real-time updates (Socket.io)
- ✅ Payment integration ready (Stripe)
- ✅ File upload ready (AWS S3/Cloudinary)
- ✅ Email & SMS notifications
- ✅ Comprehensive error handling
- ✅ Rate limiting & security

### Mobile App
- ✅ User authentication
- ✅ Ride booking
- ✅ Real-time tracking
- ✅ Push notifications
- ✅ Google Maps integration
- ✅ Driver mode

## Documentation

- **Backend**: See `backend/README.md` and `backend/SETUP_GUIDE.md`
- **Mobile**: See `mobile/README.md` and `mobile/DEVELOPMENT_SETUP.md`

## Troubleshooting

### Backend won't start
- Check MongoDB is running: `docker-compose up -d mongodb` (in backend folder)
- Verify `.env` file exists and has correct values
- Check port 8000 is not already in use

### Mobile app can't connect to backend
- Verify backend is running on `http://localhost:8000`
- For Android emulator: Use `http://10.0.2.2:8000`
- For iOS/Physical device: Use your computer's local IP (e.g., `http://192.168.1.170:8000`)
- Check `mobile/utils/apiUrlOverride.ts` for runtime override

### Database connection issues
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- Try: `mongodb://localhost:27017/keke-ride-hailing`

## Next Steps

1. Complete backend implementation (see `backend/IMPLEMENTATION_NOTES.md`)
2. Build admin panel
3. Add more features based on requirements
4. Deploy to production

## License

ISC
