/**
 * openPaymentBrowser.ts
 *
 * Shared flow for opening Paystack payment in browser and handling
 * deep-link return or browser dismiss.
 *
 * Incomplete / cancelled payments do a single silent verify and never start
 * balance polling unless verification succeeds.
 */

import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import apiClient from "@/utils/apiClient";
import { invalidateWalletCache } from "@/utils/walletCache";

/** Compatible with react-native-flash-message showMessage and safeShowMessage */
export type ShowMessageFn = (opts: {
  type?: "success" | "warning" | "danger" | "info";
  message: string;
  duration?: number;
}) => void;

export interface OpenPaymentBrowserOptions {
  paymentUrl: string;
  referenceFromInit?: string | null;
  /** Current balance string from redux (user?.profile?.balance) */
  initialBalance?: string;
  getCurrentUser: () => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  showMessage: ShowMessageFn;
}

const MAX_POLLS = 6;
const POLL_INTERVAL_MS = 3000;

export async function openPaymentBrowser({
  paymentUrl,
  referenceFromInit,
  initialBalance: _initialBalance,
  getCurrentUser,
  onRefresh,
  showMessage,
}: OpenPaymentBrowserOptions): Promise<void> {
  const SUCCESS_URL_FRAGMENT = "wallet-topup-success";

  let deepLinkHandled = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let subscription: { remove: () => void } | null = null;

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const verifyPayment = async (reference: string | null): Promise<boolean> => {
    if (!reference) return false;
    try {
      await apiClient.post("payment/verify-wallet-topup", { reference });
      invalidateWalletCache();
      return true;
    } catch {
      return false;
    }
  };

  const startBalancePolling = () => {
    stopPolling();
    let pollCount = 0;

    pollInterval = setInterval(async () => {
      pollCount++;
      try {
        await getCurrentUser();
        if (onRefresh && pollCount % 2 === 0) {
          await onRefresh();
        }
      } catch {
        // Ignore transient errors during polling.
      }

      if (pollCount >= MAX_POLLS) {
        stopPolling();
        showMessage({
          type: "info",
          message: "Payment processing. Please check your balance in a moment.",
        });
      }
    }, POLL_INTERVAL_MS);
  };

  const onPaymentConfirmed = async () => {
    showMessage({
      type: "success",
      message: "Payment successful! Updating your balance…",
      duration: 4000,
    });
    await getCurrentUser();
    if (onRefresh) await onRefresh();
    startBalancePolling();
  };

  const verifyAndRefreshIfPaid = async (reference: string | null) => {
    try {
      await WebBrowser.dismissBrowser();
    } catch (_) {}

    const verified = await verifyPayment(reference);
    if (!verified) {
      showMessage({
        type: "info",
        message: "Payment was not completed.",
      });
      return;
    }
    await onPaymentConfirmed();
  };

  const handlePaymentReturn = async (event: { url: string }) => {
    if (!event.url?.includes(SUCCESS_URL_FRAGMENT)) return;
    if (deepLinkHandled) return;

    deepLinkHandled = true;
    subscription?.remove();
    subscription = null;
    stopPolling();

    try {
      await WebBrowser.dismissBrowser();
    } catch (_) {}

    const match = event.url.match(/[?&]reference=([^&]+)/);
    const reference = match
      ? decodeURIComponent(match[1].trim())
      : (referenceFromInit ?? null);

    await verifyAndRefreshIfPaid(reference);
  };

  subscription = Linking.addEventListener("url", handlePaymentReturn);

  try {
    const result = await WebBrowser.openBrowserAsync(paymentUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: "#3C8F7C",
      toolbarColor: "#FFFFFF",
      dismissButtonStyle: "close",
    });

    if (result.type === "dismiss" || result.type === "cancel") {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));

      if (!deepLinkHandled) {
        const verified = await verifyPayment(referenceFromInit ?? null);
        if (verified) {
          deepLinkHandled = true;
          await onPaymentConfirmed();
        } else {
          showMessage({
            type: "info",
            message: "Payment cancelled.",
          });
        }
      }
    }
  } catch (error) {
    console.log("❌ WebBrowser error:", error);
    showMessage({
      type: "danger",
      message: "Could not open payment page. Please try again.",
    });
  } finally {
    if (subscription) {
      subscription.remove();
      subscription = null;
    }
  }
}
