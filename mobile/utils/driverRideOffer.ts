import type { TDriverActiveRide } from "@/types";
import { driverOfferPaymentUiKey } from "@/utils/paymentMethods";
import { setAppData } from "@/store/AppSlice";
import type { Dispatch } from "redux";

export function requestDriverOfferRefresh(dispatch: Dispatch) {
  dispatch(
    setAppData({
      driverPendingRideOffer: true,
      driverRideOfferPusherSeq: Date.now(),
    })
  );
}

export function mapPusherPayloadToOffer(
  raw: Record<string, unknown>
): Partial<TDriverActiveRide> {
  const rider = raw.rider as { name?: string; rating?: number } | undefined;
  const pickup = raw.pickup as
    | { address?: string; lat?: number; lng?: number }
    | undefined;
  const dropoff = raw.dropoff as
    | { address?: string; lat?: number; lng?: number }
    | undefined;
  const rideIdStr = String(raw.ride_id ?? "");
  const expiresSec = Number(raw.offer_expires_in ?? 60);
  const fare = raw.fare;

  return {
    ride_id: rideIdStr,
    offer_id: String(raw.offer_id ?? ""),
    status: "requested",
    accepted_by_driver: false,
    is_ride_started: false,
    drop_off_completed: false,
    cost: String(Math.round(Number(fare) || 0)),
    passenger: {
      passenger_id: "",
      passenger_email: "",
      passenger_name: rider?.name ?? "Passenger",
      passenger_image: "",
      passenger_phone_number: "",
    },
    origin: {
      lat: Number(pickup?.lat) || 0,
      long: Number(pickup?.lng) || 0,
      name: pickup?.address ?? "",
    },
    destination: {
      lat: Number(dropoff?.lat) || 0,
      long: Number(dropoff?.lng) || 0,
      name: dropoff?.address ?? "",
    },
    payment_type: driverOfferPaymentUiKey({
      payment_method: raw.payment_method,
      payment_type: raw.payment_type,
    }),
    offer_expires_in: expiresSec,
  };
}

export function mapApiOfferToRide(
  offerRide: Record<string, unknown>
): Partial<TDriverActiveRide> {
  const rideIdStr = String(offerRide.ride_id ?? "").trim();
  const fareNum = Number(offerRide.fare ?? offerRide.cost ?? 0);
  const expiresSec = Number(offerRide.offer_expires_in ?? 60);

  return {
    ...(offerRide as Partial<TDriverActiveRide>),
    ride_id: rideIdStr,
    offer_id: String(offerRide.offer_id ?? ""),
    cost: String(Math.round(fareNum)),
    status: "requested",
    accepted_by_driver: false,
    is_ride_started: false,
    drop_off_completed: false,
    payment_type: driverOfferPaymentUiKey(
      offerRide as { payment_type?: unknown; payment_method?: unknown }
    ),
    offer_expires_in: expiresSec,
  };
}

export function isPendingDriverOffer(
  ride: Partial<TDriverActiveRide> | null | undefined
): boolean {
  if (!ride?.ride_id) return false;
  const status = String(ride.status ?? "").toLowerCase();
  return status === "requested" && !ride.accepted_by_driver;
}
