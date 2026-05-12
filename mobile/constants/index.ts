import { getApiUrlWithOverride } from '@/utils/apiUrlOverride';

// Get API URL from app.json configuration (with runtime override support)
// Set this in app.json under "extra.apiUrl" for different build profiles
// OR use runtime override in utils/apiUrlOverride.ts for emergency fixes
const getApiUrl = (): string => {
  return getApiUrlWithOverride();
};

const SERVER = getApiUrl();
const SERVER_URL = `${SERVER}api/`;
const DOCUMENTATION = `https://documenter.getpostman.com/view/22814627/2sAXjF8aZT`;

// Debug log in development to verify API URL
if (__DEV__) {
  console.log('🔗 SERVER_URL:', SERVER_URL);
  console.log('🔗 PLACES_AUTOCOMPLETE endpoint:', `${SERVER_URL}maps/places/autocomplete`);
}

// Backend API endpoints for configuration and Google Maps APIs
export const PUBLIC_CONFIG = `${SERVER_URL}config/public`;

// Google Maps API Proxies (all go through backend to keep API key secure)
export const PLACES_AUTOCOMPLETE = `${SERVER_URL}maps/places/autocomplete`;
export const PLACES_DETAILS = `${SERVER_URL}maps/places/details`;
export const MAPS_DIRECTIONS = `${SERVER_URL}maps/directions`;
export const MAPS_GEOCODE = `${SERVER_URL}maps/geocode`;
export const MAPS_DISTANCE_MATRIX = `${SERVER_URL}maps/distance-matrix`;

export const LOGIN = `${SERVER_URL}auth/user/signin`;
export const REQUEST_LOGIN_OTP = `${SERVER_URL}auth/user/request-login-otp`;
export const LOGIN_WITH_OTP = `${SERVER_URL}auth/user/login-with-otp`;
export const REGISTER = `${SERVER_URL}auth/user/signup`;
export const CONFIRM_OTP = `${SERVER_URL}auth/user/confirm-otp`;
export const RESEND_OTP = `${SERVER_URL}auth/user/resend-otp`;
export const COMPLETE_SIGNUP = `${SERVER_URL}auth/user/complete-signup`;
export const ONBOARDING_RIDER_COMPLETE = `${SERVER_URL}onboarding/rider/complete`;
export const ONBOARDING_DRIVER_STAGE2 = `${SERVER_URL}onboarding/driver/stage2`;
export const ONBOARDING_DRIVER_STAGE3 = `${SERVER_URL}onboarding/driver/stage3`;
export const REFRESH_TOKEN = `${SERVER_URL}auth/user/refresh`;
export const CREATE_DRIVER = `${SERVER_URL}driver/create`;
export const FORGOT_PASSWORD = `${SERVER_URL}forgot/password`;
export const FORGOT_PASSWORD_CONFIRM_OTP = `${SERVER_URL}forgot/password/confirm-otp`;
export const RESET_PASSWORD = `${SERVER_URL}forgot/password/reset`;
export const LOGOUT = `${SERVER_URL}auth/user/signout`;
export const DELETE_ACCOUNT = `${SERVER_URL}auth/user/delete/account`;
export const CURRENT_USER = `${SERVER_URL}auth/user/me`;
export const GOOGLE_AUTH = `${SERVER_URL}auth/google/callbacks`;
export const VALIDATE_REFERRAL_CODE = `${SERVER_URL}auth/referral-code/validate`;

// VEHICLES
export const VEHICLE_TYPES = `${SERVER_URL}vehicle/types`;
export const VEHICLE_COLOURS = `${SERVER_URL}vehicle/colours`;
export const VEHICLE_MODELS = `${SERVER_URL}vehicle/models`;
export const VEHICLE_YEARS = `${SERVER_URL}vehicle/years`;

// OFFERS
export const OFFERS = `${SERVER_URL}special/offers`;

// REBOOKING
export const REBOOKINGS = `${SERVER_URL}booking/all/re-bookings`;
export const REBOOK = `${SERVER_URL}booking/rebook-ride`;

// ACCOUNT
export const PROFILE_UPDATE = `${SERVER_URL}user/profile/update-details`;
export const CHANGE_PASSWORD = `${SERVER_URL}user/profile/password-change`;
export const REFERAL_CODE = `${SERVER_URL}user/profile/referral-code`;
export const REFERAL_CODELIST = `${SERVER_URL}user/profile/referral-list`;
export const TOPUP = `${SERVER_URL}user/profile/topup`;
export const INITIATE_PAYMENT = `${SERVER_URL}payment/initialize`;
export const INITIATE_WALLET_TOPUP = `${SERVER_URL}payment/initialize-wallet-topup`;
export const VERIFY_WALLET_TOPUP = `${SERVER_URL}payment/verify-wallet-topup`;
export const SWITCH_ROLE = `${SERVER_URL}auth/user/switch-role`;
export const PASSENGER_PROFILE = `${SERVER_URL}user/profile/passenger`;
export const DRIVER_PROFILE = `${SERVER_URL}user/profile/driver`;
export const PROFILE = `${SERVER_URL}user/profile/details`;
export const ADD_BANK_ACCOUNT = `${SERVER_URL}bank/account/create`;
/** Driver's saved payout account(s) — not the NIP bank directory */
export const BANK_LIST = `${SERVER_URL}bank/account/lists`;
/**
 * Paystack-backed Nigerian bank directory (codes for resolve + payouts).
 * Mounted under `/api/driver/...` so it rides the same router as other driver calls
 * (avoids 404s when an older gateway only proxies `/api/driver/*`).
 * Also available: GET `/api/bank/nigeria/list`
 */
export const BANK_DIRECTORY_NG = `${SERVER_URL}driver/banks/nigeria/list`;
/** Also POST `/api/bank/resolve` */
export const BANK_RESOLVE_ACCOUNT = `${SERVER_URL}driver/banks/resolve`;
/** If `/api/driver/banks/*` is not deployed yet, try these payment-router paths */
export const BANK_DIRECTORY_NG_FALLBACK = `${SERVER_URL}bank/nigeria/list`;
export const BANK_RESOLVE_ACCOUNT_FALLBACK = `${SERVER_URL}bank/resolve`;
export const WITHDRAWAL = `${SERVER_URL}user/balance/withdraw`;

// EMERGENCY CONTACT
export const CREATE_EMERGENCY_CONTACT = `${SERVER_URL}emergency/contact/create`;
export const GET_EMERGENCY_CONTACT = `${SERVER_URL}emergency/contact`;
export const DELETE_EMERGENCY_CONTACT = `${SERVER_URL}emergency/contact/delete/`;
export const EDIT_EMERGENCY_CONTACT = `${SERVER_URL}emergency/contact/edit/`;
export const UPDATE_EMERGENCY_CONTACT = `${SERVER_URL}emergency/contact/update/`;
export const SEND_EMERGENCY_MESSAGE = `${SERVER_URL}emergency/contact/send-message`;

// HISTORY
export const GET_HISTORY = `${SERVER_URL}booking/history`;

// NOTIFICATIONS
export const GET_NOTIFICATIONS = `${SERVER_URL}user/notifications`;
export const MARK_NOTIFICATION_READ = `${SERVER_URL}user/notifications/`;
export const MARK_ALL_NOTIFICATIONS_READ = `${SERVER_URL}user/notifications/read-all`;
export const DELETE_NOTIFICATION = `${SERVER_URL}user/notifications/`;

// BOOKING
export const DESTINATION_DETAILS = `${SERVER_URL}booking/destination-details`;
export const CONFIRM_RIDE = `${SERVER_URL}booking/confirm-ride`;
export const FIND_DRIVER = `${SERVER_URL}booking/find-driver`;
export const DRIVER_DETAILS = `${SERVER_URL}booking/driver-details`;
export const REQUEST_RIDE = `${SERVER_URL}booking/request-ride`;
export const APPLY_CODE = `${SERVER_URL}special/offers/validate`;
export const CANCEL_RIDE = `${SERVER_URL}booking/cancel-ride`;

// RECENT PLACES
export const GET_RECENT_PLACES = `${SERVER_URL}recent-places`;
export const SAVE_RECENT_PLACE = `${SERVER_URL}recent-places`;
export const CLEAR_RECENT_PLACES = `${SERVER_URL}recent-places`;
export const WALLET_PAY = `${SERVER_URL}user/payment/for-ride`;
export const PAY_CHANGE = `${SERVER_URL}driver/ride/change-payment`;
export const ASSIGN_NEW_DRIVER = `${SERVER_URL}booking/ride/assign-new-driver`;
export const DRIVER_PASSENGER_LOCATION = `${SERVER_URL}locations/drivers-passengers`;
export const LOCATION_UPDATE = `${SERVER_URL}update/locations/drivers-passengers`;
export const DRIVER_LOCATION_FOR_RIDE = `${SERVER_URL}ride/driver-location`;

export const BOOK_RIDE = `${SERVER_URL}booking/ride`;
export const ACTIVE_RIDE = `${SERVER_URL}booking/active-ride`;
export const ACTIVE_BOOKING = `${SERVER_URL}schedule/latest/booking`;
export const CANCEL_BOOKING = `${SERVER_URL}schedule/cancel/booking`;
export const RETRIEVE_CHANGE = `${SERVER_URL}user/ride/retrieve-change`;
export const CREATE_REVIEW = `${SERVER_URL}user/review/create`;
export const START_BOOKED_RIDE = `${SERVER_URL}driver/booked-ride/start`;
export const COMPLETE_BOOKED_RIDE = `${SERVER_URL}driver/booked-ride/complete`;

// DRIVER
export const DRIVER_ACTIVE_RIDE = `${SERVER_URL}booking/driver/active-ride`;
export const DRIVER_TASKS = `${SERVER_URL}tasks/daily/`;
export const DRIVER_BOOKINGS = `${SERVER_URL}schedule/list-bookings`;
export const DRIVER_BOOKING_ID = `${SERVER_URL}schedule/show/`;
export const DRIVER_ACCEPT_BOOKING = `${SERVER_URL}schedule/accept/booking`;
/** Open scheduled pool (not yet accepted) — e.g. Bookings "Available" tab */
export const CLOSEST_BOOKING = `${SERVER_URL}schedule/closest/booking`;
/** This driver's accepted future scheduled rides — driver home "Booking Date" card only */
export const CLOSEST_BOOKING_ASSIGNED = `${SERVER_URL}schedule/closest/booking?assigned_to_driver=true`;
export const DRIVER_LATEST_BOOKING = `${SERVER_URL}schedule/latest/booking`;
export const DRIVER_CANCEL_BOOKING = `${SERVER_URL}schedule/cancel/booking`;
export const DRIVER_EARNINGS = `${SERVER_URL}driver/rides/earning`;
export const DRIVER_WITHDRAWALS = `${SERVER_URL}driver/withdrawals`;
export const DRIVER_CHALLENGES = `${SERVER_URL}driver/challenges`;
export const DRIVER_AVAILABILITY = `${SERVER_URL}driver/availability`;
export const DRIVER_PENDING_RIDE = `${SERVER_URL}driver/rides/pending`;
export const DRIVER_ACCEPT_RIDE = `${SERVER_URL}driver/rides/accept`;
export const DRIVER_START_RIDE = `${SERVER_URL}driver/rides/start`;
export const DRIVER_MARK_PICKUP_ARRIVED = `${SERVER_URL}driver/rides/arrived`;
export const DRIVER_REJECT_RIDE = `${SERVER_URL}driver/rides/cancel`;
export const DRIVER_COMPLETE_RIDE = `${SERVER_URL}driver/rides/complete`;
export const DRIVER_CONFIRM_PAYMENT = `${SERVER_URL}driver/ride/confirm-payment`;
export const DRIVER_PAY_CHANGE = `${SERVER_URL}driver/ride/change-payment`;

// CHAT
export const RETRIEVE_CHAT = `${SERVER_URL}message/passenger/driver/`;
export const CREATE_CHAT = `${SERVER_URL}message/passenger/driver/create`;

export const PUSHER_AUTH = `${SERVER_URL}broadcasting/pusher/user-auth`;
