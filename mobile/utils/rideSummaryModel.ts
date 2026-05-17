/**
 * Normalizes active-ride / completed-ride payloads for RideSummaryView.
 */

type LocLike = {
  name?: string | null;
  address?: string | null;
  lat?: string | number | null;
  long?: string | number | null;
};

export type RideSummaryModel = {
  pickup_name: string;
  dropoff_name: string;
  fareDisplay: string;
  baseFare: number;
  serviceCharge: number;
  total: number;
  paymentLabel: string;
  distance?: string;
  duration?: string;
  driver_name?: string;
};

function pickLocationLabel(loc?: LocLike | null): string {
  if (!loc || typeof loc !== "object") return "";
  const name = typeof loc.name === "string" ? loc.name.trim() : "";
  const address = typeof loc.address === "string" ? loc.address.trim() : "";
  return name || address || "";
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapRideToSummary(
  ride: Record<string, unknown> | null | undefined
): RideSummaryModel {
  const r = ride && typeof ride === "object" ? ride : {};
  const origin = r.origin as LocLike | undefined;
  const destination = r.destination as LocLike | undefined;

  const pickup_name =
    pickLocationLabel({
      name: (r.pickup_name as string) ?? origin?.name,
      address: (r.pickup_address as string) ?? origin?.address,
    }) || "Pickup location";

  const dropoff_name =
    pickLocationLabel({
      name: (r.dropoff_name as string) ?? destination?.name,
      address: (r.dropoff_address as string) ?? destination?.address,
    }) || "Dropoff location";

  const fareObj = r.fare as Record<string, unknown> | undefined;
  const fareBreakdown = r.fareBreakdown as Record<string, unknown> | undefined;
  const fareBreakdownApi = r.fare_breakdown as Record<string, unknown> | undefined;

  const baseFare = toNumber(
    fareBreakdown?.baseFare ??
      fareBreakdownApi?.ride_fare ??
      r.cost ??
      fareObj?.totalFare ??
      r.fare_amount
  );

  const serviceCharge = toNumber(
    fareBreakdown?.serviceCharge ??
      fareBreakdownApi?.service_charge ??
      fareObj?.riderServiceCharge
  );

  const summed = baseFare + serviceCharge;
  let total = toNumber(fareBreakdown?.total ?? fareBreakdownApi?.total_paid);
  if (total <= 0 && summed > 0) {
    total = summed;
  }
  if (total <= 0 && baseFare > 0) {
    total = baseFare;
  }

  const fareDisplay = (total > 0 ? total : summed).toLocaleString();

  const paymentMethod = String(
    r.payment_type ?? r.paymentMethod ?? r.payment_method ?? "wallet"
  ).toLowerCase();
  const paymentLabel =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "wallet"
        ? "Wallet"
        : paymentMethod === "card"
          ? "Card"
          : paymentMethod;

  const distanceRaw = r.distance;
  const distance =
    typeof distanceRaw === "object" && distanceRaw !== null && "text" in distanceRaw
      ? String((distanceRaw as { text?: string }).text ?? "")
      : typeof distanceRaw === "number"
        ? `${distanceRaw} km`
        : typeof distanceRaw === "string"
          ? distanceRaw
          : undefined;

  const durationRaw = r.duration;
  const duration =
    typeof durationRaw === "object" && durationRaw !== null && "text" in durationRaw
      ? String((durationRaw as { text?: string }).text ?? "")
      : typeof durationRaw === "number"
        ? `${durationRaw} min`
        : typeof durationRaw === "string"
          ? durationRaw
          : undefined;

  const driver = r.driver as Record<string, unknown> | undefined;

  return {
    pickup_name,
    dropoff_name,
    fareDisplay,
    baseFare,
    serviceCharge,
    total: total > 0 ? total : summed,
    paymentLabel,
    distance: distance || undefined,
    duration: duration || undefined,
    driver_name:
      (driver?.driver_name as string) ||
      (driver?.name as string) ||
      (r.driver_name as string) ||
      undefined,
  };
}
