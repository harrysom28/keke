/**
 * openPaymentBrowser.ts
 *
 * Shared flow for opening Paystack payment in browser and handling
 * deep-link return or browser dismiss. Use in WalletScreen and SharedProfileScreen.
 *
 * Fixes:
 *  1. isHandled=true in finally() was blocking the deep-link handler
 *  2. Verify is now called on BOTH deep-link return AND browser dismiss
 *  3. Balance polling starts after verification, not before
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

export async function openPaymentBrowser({
  paymentUrl,
  referenceFromInit,
  initialBalance,
  getCurrentUser,
  onRefresh,
  showMessage,
}: OpenPaymentBrowserOptions): Promise<void> {
  console.log("🚀 Opening payment browser with URL:", paymentUrl);

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

  const startBalancePolling = (savedInitialBalance: string | undefined) => {
    console.log(
      "🔄 Starting balance polling. Initial balance:",
      savedInitialBalance
    );
    let pollCount = 0;
    const MAX_POLLS = 20;

    pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`📊 Polling (${pollCount}/${MAX_POLLS})…`);
      await getCurrentUser();
      if (onRefresh) await onRefresh();

      if (pollCount >= MAX_POLLS) {
        stopPolling();
        console.log("⏱️ Polling timeout");
        showMessage({
          type: "info",
          message:
            "Payment processing. Please check your balance in a moment.",
        });
      }
    }, 2000);
  };

  const verifyAndRefresh = async (
    reference: string | null,
    savedInitialBalance: string | undefined
  ) => {
    try {
      await WebBrowser.dismissBrowser();
    } catch (_) {}
    if (reference) {
      try {
        await apiClient.post("payment/verify-wallet-topup", { reference });
        invalidateWalletCache();
        console.log("✅ verify-wallet-topup succeeded for ref:", reference);
      } catch (e: unknown) {
        const err = e as { response?: { data?: unknown } };
        console.log(
          "ℹ️ verify-wallet-topup response:",
          err?.response?.data ?? e
        );
      }
    }
    await getCurrentUser();
    if (onRefresh) await onRefresh();

    showMessage({
      type: "success",
      message: "Payment successful! Updating your balance…",
      duration: 4000,
    });
    startBalancePolling(savedInitialBalance);
  };

  const handlePaymentReturn = async (event: { url: string }) => {
    console.log("🔗 Deep link received:", event.url);

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

    await verifyAndRefresh(reference, initialBalance);
  };

  subscription = Linking.addEventListener("url", handlePaymentReturn);

  try {
    const result = await WebBrowser.openBrowserAsync(paymentUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: "#3C8F7C",
      toolbarColor: "#FFFFFF",
      dismissButtonStyle: "close",
    });

    console.log("✅ WebBrowser result:", result.type);

    if (result.type === "dismiss" || result.type === "cancel") {
      console.log("🚪 Browser dismissed");

      await new Promise<void>((resolve) => setTimeout(resolve, 400));

      if (!deepLinkHandled) {
        showMessage({
          type: "info",
          message: "Checking payment status…",
        });
        await verifyAndRefresh(referenceFromInit ?? null, initialBalance);
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
