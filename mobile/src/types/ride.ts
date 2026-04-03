export type RideState =
  | "IDLE"
  | "SELECTING_DESTINATION"
  | "SEARCHING"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVING"
  | "IN_RIDE"
  | "COMPLETED"
  | "CANCELLED";

export interface RideStateTransition {
  from: RideState;
  to: RideState;
}

const VALID_TRANSITIONS: RideStateTransition[] = [
  { from: "IDLE", to: "SELECTING_DESTINATION" },
  { from: "SELECTING_DESTINATION", to: "IDLE" },
  { from: "SELECTING_DESTINATION", to: "SEARCHING" },
  { from: "SEARCHING", to: "IDLE" },
  { from: "SEARCHING", to: "CANCELLED" },
  { from: "SEARCHING", to: "DRIVER_ASSIGNED" },
  { from: "DRIVER_ASSIGNED", to: "DRIVER_ARRIVING" },
  { from: "DRIVER_ASSIGNED", to: "CANCELLED" },
  { from: "DRIVER_ARRIVING", to: "IN_RIDE" },
  { from: "DRIVER_ARRIVING", to: "CANCELLED" },
  { from: "IN_RIDE", to: "COMPLETED" },
  { from: "IN_RIDE", to: "CANCELLED" },
  { from: "COMPLETED", to: "IDLE" },
  { from: "CANCELLED", to: "IDLE" },
];

export function isAllowedTransition(from: RideState, to: RideState): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export interface RidePickupDropoff {
  pickup: { latitude: number; longitude: number };
  dropoff: { latitude: number; longitude: number };
}
