# Ride-Hailing Backend API

Production-ready Node.js/Express backend for ride-hailing application with comprehensive admin panel.

## Features

- ✅ JWT Authentication with refresh tokens
- ✅ User & Driver management
- ✅ Real-time ride tracking with Socket.io
- ✅ Payment integration (Stripe ready)
- ✅ Google Maps integration
- ✅ File upload (AWS S3/Cloudinary)
- ✅ Email & SMS notifications
- ✅ Push notifications (FCM)
- ✅ Ride matching algorithm
- ✅ Surge pricing
- ✅ Admin dashboard API
- ✅ Swagger API documentation
- ✅ Comprehensive error handling
- ✅ Rate limiting & security
- ✅ Redis caching
- ✅ Docker support

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT
- **Real-time:** Socket.io (Pusher compatibility)
- **Validation:** Joi, express-validator
- **File Storage:** AWS S3 / Cloudinary
- **Payment:** Stripe
- **Maps:** Google Maps API
- **Cache:** Redis (optional)
- **Documentation:** Swagger/OpenAPI

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# Set MONGODB_URI, JWT_SECRET, etc.

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test
```

## Environment Variables

See `.env.example` for all required environment variables.

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/api-docs`

## Project Structure

```
keke/
├── backend/             # Backend API (this folder)
│   ├── src/
│   │   ├── config/      # Database, env configs
│   │   ├── models/      # Mongoose schemas
│   │   ├── controllers/ # Route controllers
│   │   ├── routes/      # API routes
│   │   ├── middleware/  # Auth, validation, error handling
│   │   ├── services/    # Business logic
│   │   ├── utils/       # Helper functions
│   │   └── server.js    # Application entry point
│   ├── admin-panel/     # React admin dashboard (to be created)
│   ├── tests/           # Unit and integration tests (to be created)
│   └── docker/          # Docker configuration
└── mobile/              # React Native mobile app
```

## API Endpoints

### Authentication
- `POST /api/auth/user/signup` - Register user
- `POST /api/auth/user/signin` - Login
- `POST /api/auth/user/confirm-otp` - Verify OTP
- `POST /api/auth/user/complete-signup` - Complete registration
- `POST /api/auth/user/refresh` - Refresh token
- `POST /api/auth/user/signout` - Logout
- `POST /api/auth/google/callbacks` - Google OAuth

### Rides
- `POST /api/booking/request-ride` - Request ride
- `GET /api/booking/estimate` - Get fare estimate
- `PATCH /api/driver/rides/accept` - Driver accepts ride
- `PATCH /api/driver/rides/start` - Start ride
- `PATCH /api/driver/rides/complete` - Complete ride
- `PATCH /api/booking/cancel-ride` - Cancel ride
- `GET /api/history` - Ride history

### Admin
- `GET /api/admin/dashboard/stats` - Dashboard metrics
- `GET /api/admin/users` - List users
- `PATCH /api/admin/users/:id` - Update user
- `GET /api/admin/drivers` - List drivers
- `GET /api/admin/rides` - List rides
- `GET /api/admin/analytics` - Analytics data

See Swagger documentation for complete API reference.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Docker

```bash
# Build image
docker build -t ride-hailing-backend .

# Run container
docker run -p 8000:8000 --env-file .env ride-hailing-backend

# Docker Compose (includes MongoDB, Redis)
docker-compose up -d
```

## Deployment

### PM2 (Production)

```bash
npm install -g pm2
pm2 start src/server.js --name ride-hailing-api
pm2 save
pm2 startup
```

### Environment-Specific Configs

- Development: `.env`
- Staging: `.env.staging`
- Production: `.env.production`

## License

ISC

## Support

For issues and questions, please create an issue in the repository.
