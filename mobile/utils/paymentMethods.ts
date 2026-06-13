export type PaymentMethodConfigId = "wallet" | "cash" | "card" | "transfer";

export type PublicPaymentMethodsConfig = {
  enabled: PaymentMethodConfigId[];
  default: PaymentMethodConfigId | null;
  labels: Record<string, string>;
};

export type EnabledPaymentMethodOption = {
  id: PaymentMethodConfigId;
  label: string;
  uiKey: string;
  isDefault: boolean;
};

export const DEFAULT_PUBLIC_PAYMENT_METHODS: PublicPaymentMethodsConfig = {
  enabled: ["wallet"],
  default: "wallet",
  labels: {
    wallet: "Wallet",
    cash: "Cash",
    card: "Card",
    transfer: "Bank Transfer",
  },
};

const UI_KEY_BY_ID: Record<PaymentMethodConfigId, string> = {
  wallet: "Wallet",
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
};

const ID_BY_UI_KEY: Record<string, PaymentMethodConfigId> = {
  Wallet: "wallet",
  Cash: "cash",
  Card: "card",
  Transfer: "transfer",
  wallet: "wallet",
  cash: "cash",
  card: "card",
  transfer: "transfer",
};

export function configToEnabledMethods(
  config?: Partial<PublicPaymentMethodsConfig> | null
): EnabledPaymentMethodOption[] {
  const merged: PublicPaymentMethodsConfig = {
    ...DEFAULT_PUBLIC_PAYMENT_METHODS,
    ...(config || {}),
    labels: {
      ...DEFAULT_PUBLIC_PAYMENT_METHODS.labels,
      ...(config?.labels || {}),
    },
  };

  const defaultId =
    merged.default && merged.enabled.includes(merged.default)
      ? merged.default
      : merged.enabled[0] || "wallet";

  return merged.enabled.map((id) => ({
    id,
    label: merged.labels[id] || UI_KEY_BY_ID[id],
    uiKey: UI_KEY_BY_ID[id],
    isDefault: id === defaultId,
  }));
}

export function defaultUiPaymentKey(
  config?: Partial<PublicPaymentMethodsConfig> | null
): string {
  const methods = configToEnabledMethods(config);
  return methods.find((m) => m.isDefault)?.uiKey || methods[0]?.uiKey || "Wallet";
}

export function mapUiPaymentToApi(uiKey: string): string {
  const map: Record<string, string> = {
    Wallet: "wallet",
    Cash: "cash",
    Card: "card",
    Transfer: "bank_transfer",
    wallet: "wallet",
    cash: "cash",
    card: "card",
    transfer: "bank_transfer",
    "Bank Transfer": "bank_transfer",
    bank_transfer: "bank_transfer",
  };
  return map[uiKey] || "wallet";
}

export function normalizeRidePaymentMethod(
  value: unknown
): PaymentMethodConfigId | "bank_transfer" {
  const raw = String(value ?? "wallet").toLowerCase();
  if (raw === "bank_transfer" || raw === "bank transfer") return "bank_transfer";
  if (raw === "cash" || raw === "card" || raw === "transfer" || raw === "wallet") {
    return raw as PaymentMethodConfigId;
  }
  return "wallet";
}

export function isCashPaymentMethod(value: unknown): boolean {
  return normalizeRidePaymentMethod(value) === "cash";
}

export function isWalletPaymentMethod(value: unknown): boolean {
  return normalizeRidePaymentMethod(value) === "wallet";
}

export function configIdFromUiKey(uiKey: string): PaymentMethodConfigId {
  return ID_BY_UI_KEY[uiKey] || "wallet";
}
