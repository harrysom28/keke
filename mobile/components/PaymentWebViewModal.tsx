/**
 * PaymentWebViewModal – Paystack payment in a smaller modal that auto-closes on success.
 * Uses WebView so we control height (~60%) and detect success URL to close and verify.
 *
 * Incomplete / cancelled payments do a single silent verify and never start balance polling.
 */
import React, { useRef, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { AntDesign } from "@expo/vector-icons";
import tw from "@/lib/tailwind";
import apiClient from "@/utils/apiClient";
import { invalidateWalletCache } from "@/utils/walletCache";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);

const SUCCESS_URL_MARKERS = ["wallet-topup-success", "wallet-topup-redirect"];
const MAX_POLLS = 6;
const POLL_INTERVAL_MS = 3000;

function isSuccessUrl(url: string): boolean {
  return SUCCESS_URL_MARKERS.some((m) => url.includes(m));
}

function extractReferenceFromUrl(url: string): string | null {
  try {
    const match = url.match(/[?&]reference=([^&]+)/);
    return match ? decodeURIComponent(match[1].trim()) : null;
  } catch {
    return null;
  }
}

export type ShowMessageFn = (opts: {
  type?: "success" | "warning" | "danger" | "info";
  message: string;
  duration?: number;
}) => void;

export interface PaymentWebViewModalProps {
  visible: boolean;
  onClose: () => void;
  paymentUrl: string;
  referenceFromInit?: string | null;
  initialBalance?: string;
  getCurrentUser: () => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  showMessage: ShowMessageFn;
}

export function PaymentWebViewModal({
  visible,
  onClose,
  paymentUrl,
  referenceFromInit,
  initialBalance: _initialBalance,
  getCurrentUser,
  onRefresh,
  showMessage,
}: PaymentWebViewModalProps) {
  const handledSuccess = useRef(false);
  const sessionClosed = useRef(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  // Reset only when a new payment session opens — not when the sheet closes mid-handler.
  useEffect(() => {
    if (visible) {
      handledSuccess.current = false;
      sessionClosed.current = false;
      stopPolling();
    }
  }, [visible, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const verifyPayment = useCallback(async (reference: string | null): Promise<boolean> => {
    if (!reference) return false;
    try {
      await apiClient.post("payment/verify-wallet-topup", { reference });
      invalidateWalletCache();
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshAfterSuccess = useCallback(async () => {
    await getCurrentUser();
    if (onRefresh) await onRefresh();
  }, [getCurrentUser, onRefresh]);

  const startBalancePolling = useCallback(() => {
    stopPolling();
    let pollCount = 0;
    pollInterval.current = setInterval(async () => {
      pollCount++;
      try {
        // Prefer a light user refresh; hit full wallet refresh only every other tick.
        await getCurrentUser();
        if (onRefresh && pollCount % 2 === 0) {
          await onRefresh();
        }
      } catch {
        // Ignore transient errors (including rate limits) during polling.
      }
      if (pollCount >= MAX_POLLS) {
        stopPolling();
        showMessage({
          type: "info",
          message: "Payment processing. Please check your balance in a moment.",
        });
      }
    }, POLL_INTERVAL_MS);
  }, [getCurrentUser, onRefresh, showMessage, stopPolling]);

  const onPaymentConfirmed = useCallback(async () => {
    showMessage({
      type: "success",
      message: "Payment successful! Updating your balance…",
      duration: 4000,
    });
    await refreshAfterSuccess();
    startBalancePolling();
  }, [refreshAfterSuccess, showMessage, startBalancePolling]);

  /** Success URL / confirmed Paystack page — verify then poll only if credit succeeded. */
  const verifyAndClose = useCallback(
    async (reference: string | null) => {
      if (handledSuccess.current || sessionClosed.current) return;
      handledSuccess.current = true;
      sessionClosed.current = true;
      stopPolling();
      onClose();

      const verified = await verifyPayment(reference);
      if (!verified) {
        showMessage({
          type: "info",
          message: "Payment was not completed.",
        });
        return;
      }
      await onPaymentConfirmed();
    },
    [onClose, onPaymentConfirmed, showMessage, stopPolling, verifyPayment]
  );

  const handleNavigationStateChange = useCallback(
    (navState: { url: string }) => {
      const url = navState?.url || "";
      if (isSuccessUrl(url)) {
        const reference = extractReferenceFromUrl(url) ?? referenceFromInit ?? null;
        verifyAndClose(reference);
      }
    },
    [referenceFromInit, verifyAndClose]
  );

  const handleShouldStartLoad = useCallback(
    (request: { url: string }) => {
      const url = request?.url || "";
      if (isSuccessUrl(url)) {
        const reference = extractReferenceFromUrl(url) ?? referenceFromInit ?? null;
        setImmediate(() => verifyAndClose(reference));
        return false;
      }
      return true;
    },
    [referenceFromInit, verifyAndClose]
  );

  const handleMessage = useCallback(
    (event: { nativeEvent: { data?: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent?.data || "{}");
        if (data?.type === "payment_success") {
          verifyAndClose(referenceFromInit ?? null);
        }
      } catch (_) {}
    },
    [referenceFromInit, verifyAndClose]
  );

  const injectedScript = `
    (function checkSuccess() {
      function run() {
        var body = document.body && document.body.innerText ? document.body.innerText : '';
        if (body.indexOf('Payment Successful') !== -1 && (body.indexOf('Secured by') !== -1 || body.indexOf('paystack') !== -1)) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'payment_success' }));
          }
        }
      }
      run();
      setTimeout(run, 500);
      setTimeout(run, 1500);
    })();
    true;
  `;

  /** User closed the sheet — one silent verify, no polling unless payment actually succeeded. */
  const handleUserClose = useCallback(async () => {
    if (sessionClosed.current) {
      onClose();
      return;
    }
    sessionClosed.current = true;
    stopPolling();
    onClose();

    if (handledSuccess.current) return;

    const verified = await verifyPayment(referenceFromInit ?? null);
    if (verified) {
      handledSuccess.current = true;
      await onPaymentConfirmed();
      return;
    }

    showMessage({
      type: "info",
      message: "Payment cancelled.",
    });
  }, [
    onClose,
    onPaymentConfirmed,
    referenceFromInit,
    showMessage,
    stopPolling,
    verifyPayment,
  ]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleUserClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { height: MODAL_HEIGHT }]}>
          <View style={styles.header}>
            <Text style={tw.style("text-lg text-black", { fontFamily: "RobotoBold" })}>
              Complete payment
            </Text>
            <TouchableOpacity
              onPress={handleUserClose}
              style={tw`h-9 w-9 items-center justify-center rounded-full bg-gray-200`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AntDesign name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: paymentUrl }}
            style={styles.webview}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            injectedJavaScript={injectedScript}
            javaScriptEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#3C8F7C" />
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  webview: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
