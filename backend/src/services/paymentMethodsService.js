/**
 * Admin-controlled payment method settings (wallet, cash, card, transfer).
 * Settings key `transfer` maps to ride field `bank_transfer`.
 */

import AdminSettings from '../models/AdminSettings.js';
import Ride from '../models/Ride.js';
import { ValidationError } from '../utils/errors.js';
import { invalidateAdminSettingsCache } from '../utils/adminSettingsCache.js';

export const DEFAULT_PAYMENT_METHODS = {
  wallet: { enabled: true, default: true },
  cash: { enabled: true, default: false },
  card: { enabled: false, default: false },
  transfer: { enabled: false, default: false },
};

export const PAYMENT_METHOD_LABELS = {
  wallet: 'Wallet',
  cash: 'Cash',
  card: 'Card',
  transfer: 'Bank Transfer',
};

const SETTINGS_METHOD_IDS = ['wallet', 'cash', 'card', 'transfer'];

const ACTIVE_RIDE_STATUSES = [
  'requested',
  'searching',
  'scheduled',
  'accepted',
  'driver_en_route',
  'arrived',
  'in-progress',
  'issue_flagged',
];

function mergePaymentMethods(docMethods) {
  const merged = {};
  for (const id of SETTINGS_METHOD_IDS) {
    merged[id] = {
      enabled: docMethods?.[id]?.enabled ?? DEFAULT_PAYMENT_METHODS[id].enabled,
      default: docMethods?.[id]?.default ?? DEFAULT_PAYMENT_METHODS[id].default,
    };
  }
  return merged;
}

/**
 * Map client/admin id or ride enum to canonical ride paymentMethod.
 * transfer → bank_transfer
 */
export function mapClientMethodToRide(method) {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'transfer' || raw === 'bank_transfer' || raw === 'bank transfer') {
    return 'bank_transfer';
  }
  if (raw === 'wallet' || raw === 'cash' || raw === 'card') {
    return raw;
  }
  throw new ValidationError(`Invalid payment method: ${method}`);
}

/** Ride paymentMethod enum → settings key */
export function mapRideMethodToSettingsKey(rideMethod) {
  if (rideMethod === 'bank_transfer') return 'transfer';
  return rideMethod;
}

export async function getPaymentMethodSettings() {
  const doc = await AdminSettings.findOne({ key: 'default' }).lean();
  return mergePaymentMethods(doc?.paymentMethods);
}

export function resolveDefaultPaymentMethod(settings) {
  const merged = settings || DEFAULT_PAYMENT_METHODS;
  const enabled = SETTINGS_METHOD_IDS.filter((id) => merged[id]?.enabled);
  if (!enabled.length) return null;
  const markedDefault = enabled.find((id) => merged[id]?.default);
  return markedDefault || enabled[0];
}

export async function getEnabledPaymentMethods() {
  const settings = await getPaymentMethodSettings();
  const defaultKey = resolveDefaultPaymentMethod(settings);
  return SETTINGS_METHOD_IDS.filter((id) => settings[id]?.enabled).map((id) => ({
    id,
    rideMethod: id === 'transfer' ? 'bank_transfer' : id,
    label: PAYMENT_METHOD_LABELS[id],
    isDefault: id === defaultKey,
  }));
}

export async function getPublicPaymentMethodsConfig() {
  const settings = await getPaymentMethodSettings();
  const enabled = SETTINGS_METHOD_IDS.filter((id) => settings[id]?.enabled);
  return {
    enabled,
    default: resolveDefaultPaymentMethod(settings),
    labels: PAYMENT_METHOD_LABELS,
  };
}

export async function assertPaymentMethodEnabled(clientMethod) {
  const rideMethod = mapClientMethodToRide(clientMethod);
  const settingsKey = mapRideMethodToSettingsKey(rideMethod);
  const settings = await getPaymentMethodSettings();
  if (!settings[settingsKey]?.enabled) {
    throw new ValidationError(
      `Payment method "${PAYMENT_METHOD_LABELS[settingsKey] || rideMethod}" is not available`
    );
  }
  return rideMethod;
}

export async function getActiveRideCountsByPaymentMethod() {
  const rows = await Ride.aggregate([
    { $match: { status: { $in: ACTIVE_RIDE_STATUSES } } },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
  ]);

  const counts = {};
  for (const id of SETTINGS_METHOD_IDS) {
    counts[id] = 0;
  }
  for (const row of rows) {
    const key = mapRideMethodToSettingsKey(row._id || 'wallet');
    if (counts[key] != null) {
      counts[key] += row.count;
    }
  }
  return counts;
}

function normalizeIncomingSettings(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('paymentMethods must be an object');
  }

  const next = mergePaymentMethods(null);
  for (const id of SETTINGS_METHOD_IDS) {
    if (payload[id] && typeof payload[id] === 'object') {
      if (payload[id].enabled !== undefined) next[id].enabled = !!payload[id].enabled;
      if (payload[id].default !== undefined) next[id].default = !!payload[id].default;
    }
  }
  return next;
}

function buildDisableWarnings(previous, next, activeCounts) {
  const warnings = [];
  for (const id of SETTINGS_METHOD_IDS) {
    const wasEnabled = previous[id]?.enabled;
    const nowEnabled = next[id]?.enabled;
    const active = activeCounts[id] || 0;
    if (wasEnabled && !nowEnabled && active > 0) {
      warnings.push(
        `${active} active ride(s) use ${PAYMENT_METHOD_LABELS[id]}. Disabling hides it for new bookings only.`
      );
    }
  }
  return warnings;
}

/**
 * Persist admin payment method toggles. Returns saved settings + warnings.
 */
export async function updatePaymentMethodSettings(payload) {
  const next = normalizeIncomingSettings(payload);
  const enabledIds = SETTINGS_METHOD_IDS.filter((id) => next[id].enabled);

  if (!enabledIds.length) {
    throw new ValidationError('At least one payment method must remain enabled');
  }

  const defaultAmongEnabled = enabledIds.find((id) => next[id].default);
  if (!defaultAmongEnabled) {
    next[enabledIds[0]].default = true;
  }

  for (const id of SETTINGS_METHOD_IDS) {
    next[id].default = enabledIds.includes(id) ? next[id].default : false;
  }

  const defaultCount = enabledIds.filter((id) => next[id].default).length;
  if (defaultCount !== 1) {
    for (const id of SETTINGS_METHOD_IDS) next[id].default = false;
    next[enabledIds[0]].default = true;
  }

  const previous = await getPaymentMethodSettings();
  const activeCounts = await getActiveRideCountsByPaymentMethod();
  const warnings = buildDisableWarnings(previous, next, activeCounts);

  let doc = await AdminSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AdminSettings.create({ key: 'default' });
  }
  doc.paymentMethods = next;
  doc.markModified('paymentMethods');
  await doc.save();
  invalidateAdminSettingsCache();

  return { paymentMethods: next, warnings, activeRideCounts: activeCounts };
}
