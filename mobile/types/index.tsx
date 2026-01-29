export type TUser = {
  address: string | null;
  balance: string;
  city: string;
  country: string;
  driver_id: string;
  email: string;
  gender: string;
  image: string;
  is_reg_completed: boolean;
  is_reg_verified: boolean;
  name: string;
  phone: string;
  police_emergency_contact: string | null;
  role: "passenger" | "driver"; // Assuming possible roles
  state: string;
  topup_account_name: string;
  topup_account_number: string;
  topup_bank_name: string;
  user_id: string;
};

export type TBooking = {
  name: string;
  image: string;
  username: string;
  booking_date: string;
  driver_id: string;
  booking_id: string;
  pickup_location: string;
  dropoff_location: string;
  booking_time: string;
  status: string;
  payment_method: string;
  cost: string;
  is_started: boolean;
  origin: string;
};

export type TVehicle = {
  vehicle_id: number;
  vehicle_type: string;
  vehicle_type_image: string;
};

type Location = {
  lat: number;
  long: number;
  name: string;
};

type Passenger = {
  passenger_email: string;
  passenger_id: string;
  passenger_image: string;
  passenger_name: string;
  passenger_phone_number: string;
};

type RideStatus = "Active" | "Completed" | "Cancelled"; // Add other possible statuses if needed
type PaymentType = "Wallet" | "Cash"; // Add other payment options if applicable

export type TDriverActiveRide = {
  accepted_by_driver: boolean;
  arrival_distance: string;
  arrival_time: string;
  cost: string;
  destination: Location;
  driver_id: string;
  driver_user_id: string;
  drop_off_completed: boolean;
  is_ride_started: boolean;
  origin: Location;
  passenger: Passenger;
  payment_type: PaymentType;
  ride_id: string;
  status: RideStatus;
  vehicle_id: number;
};

export type TDriverStats = {
  cash_payment: number;
  daily_task_completed: number;
  driver_account_name: string;
  driver_account_number: string;
  driver_bank_name: string;
  driver_referrals_earned: number;
  earned_today: number;
  in_app_payment: number;
  time_online: string;
  total_balance: string;
  total_distance: number;
  total_trip: number;
  transfer: number;
};

type Driver = {
  driver_email: string;
  driver_id: string;
  driver_image: string;
  driver_name: string;
  driver_phone: string;
  driver_rating: number;
  driver_review_count: number;
  driver_user_id: string;
  vehicle_image: string;
};

export type TRide = {
  accepted_by_driver: boolean;
  arrival_distance: string;
  arrival_time: string;
  cost: string;
  destination: Location;
  driver: Driver;
  driver_id: string;
  drop_off_completed: boolean;
  is_ride_started: boolean;
  origin: Location;
  payment_type: PaymentType;
  ride_id: string;
  status: RideStatus;
  user_id: string;
  vehicle_id: number;
};

export type TRemoteNotification = {
  title: string;
  body: string;
  data: {
    sub_type: string;
    type: "event" | "notification";
  };
};
