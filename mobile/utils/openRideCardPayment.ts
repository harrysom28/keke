/**
 * Collect Paystack card payment for a ride after create (on-demand or scheduled).
 * Returns true only when verify-ride-card succeeds.
 * Does not touch wallet top-up flows.
 */

import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import apiClient from "@/utils/apiClient";

const SUCCESS_URL_FRAGMENT = "ride-card-success";

export type RideCardShowMessageFn = (opts: {
  type?: "success" | "warning" | "danger" | "info";
  message: string;
  duration?: number;
}) => void;

/**
 * Initialize Paystack checkout for a card ride, open browser, verify on return.
 * @returns true if payment verified (or already paid)
 */
export async function collectRideCardPayment(
  rideId: string,
  showMessage?: RideCardShowMessageFn
): Promise<boolean> {
  const id = String(rideId || "").trim();
  if (!id) return false;

  let paymentUrl = "";
  let referenceFromInit: string | null = null;

  try {
    const initRes = await apiClient.post("payment/initialize-ride-card", {
      rideId: id,
    });
    const data = initRes?.data?.data;
    if (data?.already_paid) {
      return true;
    }
    paymentUrl = String(data?.payment_url || "").trim();
    referenceFromInit = data?.reference ? String(data.reference) : null;
    if (!paymentUrl) {
      showMessage?.({
        type: "danger",
        message: "Could not start card payment. Try Wallet or Cash.",
      });
      return false;
    }
  } catch (err: any) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "Could not start card payment.";
    showMessage?.({ type: "danger", message: String(msg) });
    return false;
  }

  return openRideCardBrowser({
    paymentUrl,
    referenceFromInit,
    showMessage,
  });
}

async function verifyRideCardPayment(reference: string | null): Promise<boolean> {
  if (!reference) return false;
  try {
    await apiClient.post("payment/verify-ride-card", { reference });
    return true;
  } catch {
    return false;
  }
}

async function openRideCardBrowser({
  paymentUrl,
  referenceFromInit,
  showMessage,
}: {
  paymentUrl: string;
  referenceFromInit?: string | null;
  showMessage?: RideCardShowMessageFn;
}): Promise<boolean> {
  let deepLinkHandled = false;
  let paid = false;
  let subscription: { remove: () => void } | null = null;

  const finishVerified = async (reference: string | null) => {
    try {
      await WebBrowser.dismissBrowser();
    } catch (_) {}
    const verified = await verifyRideCardPayment(reference);
    if (verified) {
      paid = true;
    } else {
      showMessage?.({
        type: "info",
        message: "Payment was not completed.",
      });
    }
    return verified;
  };

  const handlePaymentReturn = async (event: { url: string }) => {
    if (!event.url?.includes(SUCCESS_URL_FRAGMENT)) return;
    if (deepLinkHandled) return;
    deepLinkHandled = true;
    subscription?.remove();
    subscription = null;

    const match = event.url.match(/[?&]reference=([^&]+)/);
    const reference = match
      ? decodeURIComponent(match[1].trim())
      : (referenceFromInit ?? null);

    await finishVerified(reference);
  };

  subscription = Linking.addEventListener("url", handlePaymentReturn);

  try {
    const result = await WebBrowser.openBrowserAsync(paymentUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: "#3C8F7C",
      toolbarColor: "#FFFFFF",
      dismissButtonStyle: "close",
    });

    if (!deepLinkHandled && (result.type === "dismiss" || result.type === "cancel")) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      if (!deepLinkHandled) {
        const verified = await verifyRideCardPayment(referenceFromInit ?? null);
        if (verified) {
          deepLinkHandled = true;
          paid = true;
        } else {
          showMessage?.({
            type: "info",
            message: "Payment cancelled.",
          });
        }
      }
    }
  } catch (error) {
    console.log("❌ Ride card WebBrowser error:", error);
    showMessage?.({
      type: "danger",
      message: "Could not open payment page. Please try again.",
    });
    paid = false;
  } finally {
    if (subscription) {
      subscription.remove();
      subscription = null;
    }
  }

  return paid;
}

/** Best-effort cancel when the rider abandons card checkout. */
export async function cancelUnpaidCardRide(rideId: string, isScheduled = false): Promise<void> {
  const id = String(rideId || "").trim();
  if (!id) return;
  try {
    if (isScheduled) {
      await apiClient.post("schedule/cancel/booking", {
        booking_id: id,
        rideId: id,
        reason: "Card payment not completed",
      });
    } else {
      await apiClient.post("booking/cancel-ride", {
        rideId: id,
        reason: "Card payment not completed",
      });
    }
  } catch (err) {
    console.log("cancelUnpaidCardRide failed:", (err as any)?.message);
  }
}
