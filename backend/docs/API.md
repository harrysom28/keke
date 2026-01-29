# Keke Ride-Hailing API Documentation

## Base URL
```
http://localhost:8000/api
```

## Authentication

Most endpoints require authentication using a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

---

## Endpoints Overview

### Authentication
- `POST /api/auth/user/signup` - Register new user
- `POST /api/auth/user/signin` - Login user
- `POST /api/auth/user/confirm-otp` - Verify OTP
- `POST /api/auth/user/resend-otp` - Resend OTP
- `POST /api/auth/user/complete-signup` - Complete registration
- `POST /api/auth/google/callbacks` - Google OAuth callback
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/signout` - Logout
- `GET /api/auth/me` - Get current user

### Rides
- `POST /api/booking/request-ride` - Request a ride
- `GET /api/booking/destination-details` - Get fare estimate
- `GET /api/booking/active-ride` - Get active ride
- `POST /api/booking/cancel-ride` - Cancel ride
- `GET /api/booking/history` - Get ride history
- `GET /api/ride/driver-location` - Get driver location for ride
- `POST /api/booking/ride/assign-new-driver` - Assign new driver

### Scheduled Rides
- `GET /api/schedule/list-bookings` - List scheduled bookings
- `POST /api/schedule/accept/booking` - Accept scheduled booking
- `GET /api/schedule/closest/booking` - Get closest scheduled booking

### Driver
- `GET /api/driver/profile` - Get driver profile
- `PATCH /api/driver/profile` - Update driver profile
- `POST /api/driver/location/update` - Update driver location
- `POST /api/driver/go-online` - Go online
- `POST /api/driver/go-offline` - Go offline
- `POST /api/driver/rides/accept` - Accept ride
- `POST /api/driver/rides/reject` - Reject ride
- `POST /api/driver/rides/start` - Start ride
- `POST /api/driver/rides/complete` - Complete ride
- `GET /api/driver/earnings` - Get earnings

### Payments
- `POST /api/user/payment/initialize` - Initialize payment
- `POST /api/user/payment/for-ride` - Pay for ride
- `POST /api/user/profile/topup` - Top up wallet
- `POST /api/user/balance/withdraw` - Withdraw balance
- `GET /api/user/ride/retrieve-change` - Get change/refund

### Profile
- `GET /api/user/profile/details` - Get user profile
- `PATCH /api/user/profile/update-details` - Update profile
- `POST /api/user/profile/password-change` - Change password
- `GET /api/user/profile/passenger` - Get passenger profile
- `GET /api/user/profile/driver` - Get driver profile
- `GET /api/user/profile/referral-code` - Get referral code
- `GET /api/user/profile/referral-list` - Get referral list

### Additional Features
- `POST /api/emergency/contact/create` - Create emergency contact
- `GET /api/emergency/contact` - Get emergency contacts
- `PATCH /api/emergency/contact/update/:id` - Update emergency contact
- `DELETE /api/emergency/contact/delete/:id` - Delete emergency contact
- `POST /api/emergency/contact/send-message` - Send emergency message
- `GET /api/recent-places` - Get recent places
- `POST /api/recent-places` - Save recent place
- `DELETE /api/recent-places` - Clear recent places
- `GET /api/special/offers` - Get special offers
- `POST /api/special/offers/validate` - Validate promocode
- `POST /api/user/review/create` - Create review
- `GET /api/booking/all/re-bookings` - Get re-bookings
- `POST /api/booking/rebook-ride` - Rebook ride

### Notifications
- `GET /api/user/notifications` - Get user notifications
- `PATCH /api/user/notifications/:id/read` - Mark notification as read
- `PATCH /api/user/notifications/read-all` - Mark all as read
- `DELETE /api/user/notifications/:id` - Delete notification

### Messages/Chat
- `GET /api/message/passenger/driver/:rideId` - Get chat messages
- `POST /api/message/passenger/driver/create` - Send message

### Maps
- `GET /api/maps/places/autocomplete` - Places autocomplete
- `GET /api/maps/places/details` - Place details
- `GET /api/maps/directions` - Get directions
- `GET /api/maps/geocode` - Geocode address
- `GET /api/maps/distance-matrix` - Distance matrix

### File Upload
- `POST /api/user/profile/upload-image` - Upload profile image
- `POST /api/driver/vehicle/upload-images` - Upload vehicle images
- `POST /api/driver/documents/upload` - Upload driver documents
- `POST /api/upload/file` - Upload generic file

### Pusher Authentication
- `POST /api/broadcasting/pusher/user-auth` - Authenticate for Pusher channels

### Admin Panel
- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout
- `GET /api/admin/me` - Get admin profile
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/analytics` - Analytics data
- `GET /api/admin/users` - List users
- `GET /api/admin/users/:id` - Get user details
- `PATCH /api/admin/users/:id` - Update user
- `PATCH /api/admin/users/:id/activate` - Activate user
- `PATCH /api/admin/users/:id/deactivate` - Deactivate user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/drivers` - List drivers
- `GET /api/admin/drivers/:id` - Get driver details
- `PATCH /api/admin/drivers/:id/verify` - Verify driver
- `PATCH /api/admin/drivers/:id/reject` - Reject driver
- `GET /api/admin/drivers/:id/earnings` - Get driver earnings
- `GET /api/admin/drivers/:id/rides` - Get driver rides
- `GET /api/admin/rides` - List rides
- `GET /api/admin/rides/:id` - Get ride details
- `PATCH /api/admin/rides/:id` - Update ride
- `POST /api/admin/rides/:id/dispute` - Handle dispute
- `GET /api/admin/payments` - List payments
- `GET /api/admin/revenue` - Revenue statistics
- `POST /api/admin/payments/:id/refund` - Process refund
- `GET /api/admin/withdrawals` - List withdrawals
- `PATCH /api/admin/withdrawals/:id/approve` - Approve withdrawal
- `GET /api/admin/support-tickets` - List support tickets
- `GET /api/admin/support-tickets/:id` - Get ticket details
- `POST /api/admin/support-tickets/:id/assign` - Assign ticket
- `POST /api/admin/support-tickets/:id/resolve` - Resolve ticket
- `POST /api/admin/support-tickets/:id/respond` - Respond to ticket
- `GET /api/admin/promocodes` - List promocodes
- `POST /api/admin/promocodes` - Create promocode
- `PATCH /api/admin/promocodes/:id` - Update promocode

---

## Response Format

### Success Response
```json
{
  "status": "success",
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Error message",
  "errors": {
    // Validation errors (if applicable)
  }
}
```

---

## Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

---

## WebSocket Events

### Client Events
- `authenticate` - Authenticate socket connection
- `join` - Join user room
- `join-driver` - Join driver room
- `leave` - Leave user room
- `accept-ride` - Accept ride request
- `join-ride-chat` - Join ride chat room
- `leave-ride-chat` - Leave ride chat room

### Server Events
- `authenticated` - Authentication successful
- `ride-request` - New ride request
- `ride-status-update` - Ride status changed
- `driver-location-update` - Driver location updated
- `ride-accepted` - Ride accepted by driver
- `ride-started` - Ride started
- `ride-completed` - Ride completed
- `ride-cancelled` - Ride cancelled
- `new-message` - New chat message
- `new-chat-message` - New chat message (in ride room)

---

## Notes

- All timestamps are in ISO 8601 format
- All coordinates use [longitude, latitude] format (GeoJSON standard)
- Pagination: Use `page` and `limit` query parameters (default: page=1, limit=20)
- File uploads: Maximum file size is 5MB by default
- Rate limiting: Applied to authentication and OTP endpoints

---

For detailed endpoint documentation, see the Swagger UI at:
```
http://localhost:8000/api-docs
```
(When Swagger is configured)
