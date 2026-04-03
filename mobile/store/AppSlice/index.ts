import { createSlice } from "@reduxjs/toolkit";

export interface IRide {
  origin: {
    name: string;
    long: string;
    lat: string;
  };
  destination: {
    name: string;
    long: string;
    lat: string;
  };
  vehicle_type_id: string;
  driver_id: string;
  payment_type: string;
  promo_code: string;
}

export interface IUtils {
  user_location:
    | {
        name: string;
        long: string;
        lat: string;
      }
    | object;
  vehicle: object;
  drivers: Array<object>;
  promo_code: string;
  driver_id: string;
  driver: object;
  distanceTime: { cost: string; distance: string; duration: string };
}

interface IState {
  isBooking: boolean;
  /** Set by Rides tab to request opening the Book Ride sheet when Home is focused */
  requestOpenBookRide?: boolean;
  ride: {
    status: boolean;
    data: IRide | object;
    utils: IUtils | object;
  };
  hasBookedRide: boolean;
  subscription: {
    receipt: boolean;
    chat: boolean;
    trip_completed: boolean;
    started: boolean;
    driver_cancelled: boolean;
    passenger_cancelled: boolean;
  };
  /** TASK 5: Notifications that arrived via push - append to list without refetch */
  incomingNotifications: Array<{
    notification_id: string;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    related_ride_id?: string | null;
    related_payment_id?: string | null;
  }>;
  unread_count: number;
  latest_notification: null | {
    id?: string;
    notification_id: string;
    title: string;
    message: string;
    type: string;
    priority?: string;
    screen?: string;
    action_type?: string;
    action_payload?: any;
    ride_id?: string | null;
    duration_ms?: number;
    image_url?: string | null;
    delivered_at?: string;
    event_key?: string;
  };
}

const InitialState: IState = {
  isBooking: false,
  ride: {
    status: false,
    data: {},
    utils: {},
  },
  hasBookedRide: false,
  subscription: {
    receipt: false,
    chat: false,
    trip_completed: false,
    started: false,
    driver_cancelled: false,
    passenger_cancelled: false,
  },
  incomingNotifications: [],
  unread_count: 0,
  latest_notification: null,
};
const AppSlice = createSlice({
  name: "App",
  initialState: InitialState,
  reducers: {
    setAppData: (state, action) => {
      Object.assign(state, action.payload);
    },
    changeRideStatus: (state, action) => {
      state.ride.status = action.payload;
    },
    setRideData: (state, action: { payload: Partial<IRide> }) => {
      Object.assign(state.ride.data, action.payload);
    },
    setRideUtils: (state, action: { payload: Partial<IUtils> }) => {
      state.ride.utils = { ...state.ride.utils, ...action.payload };
    },
    setSubscriptionUtils: (
      state,
      action: { payload: Partial<IState["subscription"]> }
    ) => {
      Object.assign(state.subscription, action.payload);
    },
    resetSubscription: (state) => {
      state.subscription = InitialState.subscription;
    },
    /** TASK 5: Add notification from push - realtime sync without refetch */
    addIncomingNotification: (state, action) => {
      const n = action.payload;
      const notificationId = n.notification_id || n.id || `push-${Date.now()}`;
      const exists = (state.incomingNotifications || []).some(
        (item) => item.notification_id === notificationId
      );
      if (exists) {
        state.latest_notification = {
          id: n.id,
          notification_id: notificationId,
          title: n.title || "",
          message: n.message || n.body || "",
          type: n.type || "general",
          priority: n.priority,
          screen: n.screen,
          action_type: n.action_type,
          action_payload: n.action_payload,
          ride_id: n.ride_id ?? n.related_ride_id ?? n.rideId ?? null,
          duration_ms: n.duration_ms,
          image_url: n.image_url ?? null,
          delivered_at: n.delivered_at,
          event_key: n.event_key,
        };
        return;
      }
      const item = {
        notification_id: notificationId,
        type: n.type || "general",
        title: n.title || "",
        message: n.message || n.body || "",
        is_read: false,
        created_at: n.created_at || new Date().toISOString(),
        related_ride_id: n.related_ride_id ?? n.rideId ?? null,
        related_payment_id: n.related_payment_id ?? n.paymentId ?? null,
      };
      state.incomingNotifications = [item, ...(state.incomingNotifications || [])];
      state.unread_count += 1;
      state.latest_notification = {
        id: n.id,
        notification_id: notificationId,
        title: n.title || "",
        message: n.message || n.body || "",
        type: n.type || "general",
        priority: n.priority,
        screen: n.screen,
        action_type: n.action_type,
        action_payload: n.action_payload,
        ride_id: n.ride_id ?? n.related_ride_id ?? n.rideId ?? null,
        duration_ms: n.duration_ms,
        image_url: n.image_url ?? null,
        delivered_at: n.delivered_at,
        event_key: n.event_key,
      };
    },
    clearIncomingNotifications: (state) => {
      state.incomingNotifications = [];
    },
    markAllIncomingAsRead: (state) => {
      state.incomingNotifications = (state.incomingNotifications || []).map(
        (n) => ({ ...n, is_read: true })
      );
      state.unread_count = 0;
    },
    markIncomingAsRead: (state, action) => {
      const id = action.payload;
      const list = state.incomingNotifications || [];
      const target = list.find((n) => n.notification_id === id);
      state.incomingNotifications = list.map((n) =>
        n.notification_id === id ? { ...n, is_read: true } : n
      );
      if (target && !target.is_read && state.unread_count > 0) {
        state.unread_count -= 1;
      }
    },
    removeIncomingNotification: (state, action) => {
      const id = action.payload;
      const target = (state.incomingNotifications || []).find(
        (n) => n.notification_id === id
      );
      state.incomingNotifications = (state.incomingNotifications || []).filter(
        (n) => n.notification_id !== id
      );
      if (target && !target.is_read && state.unread_count > 0) {
        state.unread_count -= 1;
      }
    },
    setUnreadCount: (state, action) => {
      state.unread_count = Math.max(0, Number(action.payload) || 0);
    },
    setLatestNotification: (state, action) => {
      state.latest_notification = action.payload ?? null;
    },
    decrementUnreadCount: (state) => {
      state.unread_count = Math.max(0, (state.unread_count || 0) - 1);
    },
    clearUnreadCount: (state) => {
      state.unread_count = 0;
    },
    resetObject: (state, action) => {
      return InitialState;
    },
  },
});

export const {
  setAppData,
  resetObject,
  setRideData,
  changeRideStatus,
  setRideUtils,
  setSubscriptionUtils,
  resetSubscription,
  addIncomingNotification,
  clearIncomingNotifications,
  markAllIncomingAsRead,
  markIncomingAsRead,
  removeIncomingNotification,
  setUnreadCount,
  setLatestNotification,
  decrementUnreadCount,
  clearUnreadCount,
} = AppSlice.actions;
interface RootState {
  App: IState;
}

export const AppDetailsState = (state: RootState): IState => state.App;
export default AppSlice;
