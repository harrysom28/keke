export const rideStates = [
  "heading_to_pickup",
  "arrived_pickup",
  "trip_started",
  "near_destination",
  "completed",
] as const;

export type RideState = (typeof rideStates)[number];

type AnyObj = Record<string, any>;

function normalizeStatus(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function parseMinutesLike(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  // "3 min", "3mins", "3 minutes"
  const m = s.match(/(\d+(\.\d+)?)\s*(min|mins|minute|minutes)\b/);
  if (m?.[1]) return Math.round(parseFloat(m[1]));
  // raw number string
  const n = parseFloat(s);
  if (Number.isFinite(n)) return Math.round(n);
  return null;
}

function formatArrivingByFromMinutes(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function getRideStateFromData(data: AnyObj): RideState {
  const status = normalizeStatus(data?.status);
  const lifecycle = normalizeStatus(data?.lifecycle_status ?? data?.lifecycleStatus);
  const internal = normalizeStatus(data?.internal_status ?? data?.internalStatus);
  const started = !!(data?.is_ride_started ?? data?.isRideStarted ?? data?.is_started);
  const completed =
    status === "completed" ||
    status === "complete" ||
    status === "dropped_off" ||
    status === "dropoff_completed" ||
    status === "issue_flagged" ||
    !!data?.drop_off_completed;

  if (completed) return "completed";
  if (status === "near_destination" || status === "near_dropoff" || status === "almost_there")
    return "near_destination";
  // Backend may omit boolean flags; use lifecycle / internal status as source of truth.
  if (
    lifecycle === "ride_started" ||
    internal === "in_progress" ||
    internal === "inprogress"
  ) {
    return "trip_started";
  }
  if (started || status === "started" || status === "in_progress" || status === "intransit")
    return "trip_started";
  if (status === "arrived" || status === "driver_arrived" || status === "arrived_pickup")
    return "arrived_pickup";
  return "heading_to_pickup";
}

export function getArrivingByLabel(data: AnyObj): string | null {
  // If backend already provides a clock time, keep it.
  const raw = (data?.arriving_by ?? data?.arrivingBy ?? data?.arrival_by ?? data?.arrivalBy) as
    | string
    | undefined;
  if (raw && /^\d{1,2}:\d{2}$/.test(raw.trim())) return raw.trim();

  const mins = parseMinutesLike(data?.arrival_time ?? data?.eta ?? data?.routeEta);
  if (mins == null || mins <= 0) return null;
  return formatArrivingByFromMinutes(mins);
}

export function getTripContext(data: AnyObj): { fromLabel: string; toLabel: string } {
  const fromLabel =
    data?.origin?.name ||
    data?.pickup_location ||
    data?.pickupLocation ||
    data?.from ||
    "Pickup location";
  const toLabel =
    data?.destination?.name ||
    data?.dropoff_location ||
    data?.dropoffLocation ||
    data?.to ||
    "Drop-off location";
  return { fromLabel: String(fromLabel), toLabel: String(toLabel) };
}

/**
 * Driver's personal name only (no vehicle fallback).
 * Use for the rider trip card primary line so we don't show "YOUR DRIVER" above a vehicle string.
 */
export function getRiderDriverPersonalName(data: AnyObj): string {
  const driver = data?.driver ?? null;
  const u = driver?.user ?? null;
  const ride = data ?? {};
  const trimStr = (s: unknown) => (typeof s === "string" ? s.trim() : "");

  const first =
    driver?.first_name ||
    driver?.firstname ||
    u?.first_name ||
    u?.firstname ||
    u?.firstName ||
    "";
  const last =
    driver?.last_name ||
    driver?.lastname ||
    u?.last_name ||
    u?.lastname ||
    u?.lastName ||
    "";
  const joined = [first, last].filter(Boolean).join(" ").trim();

  return (
    joined ||
    trimStr(driver?.driver_name) ||
    trimStr(driver?.name) ||
    trimStr(u?.name) ||
    trimStr(u?.fullName) ||
    trimStr(driver?.full_name) ||
    trimStr(ride?.driver_name) ||
    trimStr(ride?.driverName) ||
    ""
  );
}

/** Human-readable driver label for headers/banners (includes vehicle as last resort before fallback). */
export function getRiderDriverDisplayName(data: AnyObj, emptyFallback = "Driver"): string {
  const personal = getRiderDriverPersonalName(data).trim();
  if (personal) return personal;

  const driver = data?.driver ?? null;
  const trimStr = (s: unknown) => (typeof s === "string" ? s.trim() : "");
  return (
    trimStr(driver?.vehicle_name) ||
    trimStr(driver?.vehicleName) ||
    emptyFallback
  );
}

export function getRiderHeaderCopy(state: RideState, data: AnyObj) {
  const driverName = getRiderDriverDisplayName(data, "Unknown Driver");

  const etaMin = parseMinutesLike(data?.arrival_time ?? data?.eta ?? data?.routeEta);
  const etaLabel =
    typeof data?.arrival_time === "string" && data.arrival_time.includes(":")
      ? data.arrival_time
      : etaMin != null
        ? `${etaMin} min`
        : "";

  switch (state) {
    case "heading_to_pickup":
      return {
        title: "Picking you up",
        subtitle: etaLabel ? `${driverName} • ${etaLabel} away` : `${driverName} is on the way`,
        reassurance: undefined,
      };
    case "arrived_pickup":
      return {
        title: "Driver has arrived",
        subtitle: `${driverName} is at pickup`,
        reassurance: undefined,
      };
    case "trip_started":
      return {
        title: "Trip in progress",
        subtitle: "Sit back and relax — we’re en route",
        reassurance: "You’re on your way.",
      };
    case "near_destination":
      return {
        title: "Arriving soon",
        subtitle: "Almost at your destination",
        reassurance: "Get ready to hop off.",
      };
    case "completed":
      return {
        title: "Trip completed",
        subtitle: "Thanks for riding with us",
        reassurance: "Hope you had a great trip.",
      };
  }
}

export function getDriverHeaderCopy(state: RideState) {
  switch (state) {
    case "heading_to_pickup":
      return { title: "Heading to pickup", subtitle: "Navigate to the rider" };
    case "arrived_pickup":
      return { title: "At pickup", subtitle: "Confirm rider, then start trip" };
    case "trip_started":
      return { title: "Passenger onboard", subtitle: "Driving to destination" };
    case "near_destination":
      return { title: "Near destination", subtitle: "Prepare to complete the trip" };
    case "completed":
      return { title: "Trip completed", subtitle: "Great work" };
  }
}

