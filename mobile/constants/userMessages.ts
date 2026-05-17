/**
 * Standard user-facing copy for toasts and alerts.
 * Prefer these over ad-hoc strings so messaging stays consistent in production.
 */
export const UserMessages = {
  genericError: "We couldn't complete that request. Please try again.",
  networkError: "Can't reach Keke right now. Check your connection and try again.",
  authRequired: "Your session expired. Please sign in again.",
  validationHint: "Please check your entries and try again.",

  success: {
    saved: "Saved successfully.",
    cancelled: "Cancelled successfully.",
    paymentReceived: "Payment received. Thank you!",
    walletCredited: (amount: string) => `Wallet credited! Balance ${amount}`,
    rideBooked: "Ride requested. Finding a driver…",
    driverAssigned: "Driver assigned.",
  },
} as const;
