import axios, { AxiosRequestConfig } from "axios";
import { DRIVER_ACCEPT_BOOKING, DRIVER_AVAILABILITY } from "@/constants";
import { getErrorMessage } from "@/utils/errorHandler";

function isValidRideId(rideId: string): boolean {
  return /^[a-f\d]{24}$/i.test(String(rideId || "").trim());
}

function needsGoOnlineMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const m = message.toLowerCase();
  return m.includes("online") && m.includes("available");
}

export type AcceptScheduledResult =
  | { ok: true; data: unknown; wentOnlineFirst: boolean }
  | { ok: false; status?: number; silent?: boolean; message: string };

/**
 * POST accept scheduled booking; if server says driver must be online/available,
 * PATCH availability on once and retry (matches dashboard toggle behavior).
 */
export async function postAcceptScheduledBooking(
  rideId: string,
  apiConfig: AxiosRequestConfig
): Promise<AcceptScheduledResult> {
  const id = String(rideId || "").trim();
  if (!isValidRideId(id)) {
    return { ok: false, message: "Invalid booking reference." };
  }

  const post = () =>
    axios.post(DRIVER_ACCEPT_BOOKING, { rideId: id }, apiConfig);

  try {
    const { data } = await post();
    return { ok: true, data, wentOnlineFirst: false };
  } catch (first: unknown) {
    const err = first as {
      response?: { status?: number; data?: { message?: string } };
    };
    const status = err?.response?.status;
    const msg = err?.response?.data?.message;

    if (status === 401) {
      return { ok: false, status: 401, silent: true, message: "" };
    }
    if (status === 404) {
      return { ok: false, status: 404, silent: true, message: getErrorMessage(first) };
    }

    if (needsGoOnlineMessage(msg)) {
      try {
        await axios.patch(DRIVER_AVAILABILITY, { isAvailable: true }, apiConfig);
        const { data } = await post();
        return { ok: true, data, wentOnlineFirst: true };
      } catch (second: unknown) {
        return { ok: false, message: getErrorMessage(second) };
      }
    }

    return { ok: false, message: getErrorMessage(first) };
  }
}
