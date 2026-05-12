/**
 * Paystack service - Dedicated Virtual Accounts (DVA) and customer management
 * Used for generating unique bank account numbers per user for wallet top-ups.
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const PAYSTACK_BASE = 'https://api.paystack.co';
const PAYSTACK_TIMEOUT_MS = 25000;

/**
 * Get Paystack secret key
 * @returns {string|null}
 */
const getSecretKey = () => process.env.PAYSTACK_SECRET_KEY || null;

/**
 * Create a Paystack customer (required before creating DVA)
 * @param {Object} params
 * @param {string} params.email - Customer email (required)
 * @param {string} [params.first_name]
 * @param {string} [params.last_name]
 * @param {string} [params.phone]
 * @param {Object} [params.metadata] - e.g. { userId: '...' }
 * @returns {Promise<{ customer_code: string, id: number }|null>}
 */
export async function createPaystackCustomer({ email, first_name, last_name, phone, metadata }) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    logger.warn('Paystack: PAYSTACK_SECRET_KEY not set, skipping customer creation');
    return null;
  }

  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE}/customer`,
      {
        email: email || `user-${Date.now()}@keke.app`,
        first_name: first_name || 'Customer',
        last_name: last_name || 'User',
        phone: phone || undefined,
        metadata: metadata || undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      }
    );

    if (data?.status && data?.data) {
      return { customer_code: data.data.customer_code, id: data.data.id };
    }
    logger.warn('Paystack createCustomer: unexpected response', data);
    return null;
  } catch (err) {
    logger.error(`Paystack createCustomer error: ${err?.response?.data?.message || err.message}`);
    return null;
  }
}

/**
 * Create a Dedicated Virtual Account for a Paystack customer
 * @param {Object} params
 * @param {string} params.customerCode - Paystack customer_code (CUS_xxx)
 * @param {string} [params.preferredBank] - e.g. 'wema-bank', 'titan-paystack'
 * @param {string} [params.first_name]
 * @param {string} [params.last_name]
 * @param {string} [params.phone]
 * @returns {Promise<{ account_number: string, bank_name: string, account_name: string }|null>}
 */
export async function createDedicatedVirtualAccount({
  customerCode,
  preferredBank = 'wema-bank',
  first_name,
  last_name,
  phone,
}) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    logger.warn('Paystack: PAYSTACK_SECRET_KEY not set, skipping DVA creation');
    return null;
  }

  try {
    const body = {
      customer: customerCode,
      preferred_bank: preferredBank,
    };
    if (first_name) body.first_name = first_name;
    if (last_name) body.last_name = last_name;
    if (phone) body.phone = phone;

    const { data } = await axios.post(
      `${PAYSTACK_BASE}/dedicated_account`,
      body,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      }
    );

    if (data?.status && data?.data) {
      const d = data.data;
      return {
        account_number: d.account_number,
        bank_name: d.bank?.name || 'Bank',
        account_name: d.account_name,
      };
    }
    logger.warn('Paystack createDVA: unexpected response', data);
    return null;
  } catch (err) {
    const msg = err?.response?.data?.message || err.message;
    logger.error(`Paystack createDVA error: ${msg}`);
    if (msg && (msg.includes('not available for your business') || msg.includes('Dedicated NUBAN'))) {
      logger.warn('Paystack DVA is not enabled for this account. Complete go-live and contact support@paystack.com to request Dedicated Virtual Accounts. Users can still top up via the fallback bank reference (KEKE + user ID).');
    }
    return null;
  }
}

/**
 * Create or get Paystack customer and assign DVA
 * @param {Object} user - Mongoose User document
 * @param {string} [preferredBank] - Bank slug
 * @returns {Promise<{ account_number: string, bank_name: string, account_name: string, paystackCustomerCode: string }|null>}
 */
export async function createDVAForUser(user, preferredBank = 'wema-bank') {
  const secretKey = getSecretKey();
  if (!secretKey) return null;

  const email = user.email || `user-${user._id}@keke.app`;
  const nameParts = (user.name || 'Customer User').trim().split(/\s+/);
  const first_name = nameParts[0] || 'Customer';
  const last_name = nameParts.slice(1).join(' ') || 'User';
  const phone = user.phone || undefined;

  let customerCode = user.paystackCustomerCode;

  if (!customerCode) {
    const customer = await createPaystackCustomer({
      email,
      first_name,
      last_name,
      phone,
      metadata: { userId: user._id.toString() },
    });
    if (!customer) return null;
    customerCode = customer.customer_code;
  }

  const dva = await createDedicatedVirtualAccount({
    customerCode,
    preferredBank,
    first_name,
    last_name,
    phone,
  });

  if (!dva) return null;

  return {
    ...dva,
    paystackCustomerCode: customerCode,
  };
}

/**
 * Initialize a one-time transaction (card/bank) - returns URL for checkout
 * Used for wallet top-up. Amount in Naira; sent to Paystack as kobo.
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {number} params.amount - Amount in Naira
 * @param {Object} [params.metadata] - e.g. { type: 'wallet_topup', userId: '...' }
 * @param {string} [params.callback_url]
 * @returns {Promise<{ authorization_url: string, reference: string }|null>}
 */
export async function initializeTransaction({ email, amount, metadata, callback_url }) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    logger.warn('Paystack: PAYSTACK_SECRET_KEY not set');
    return null;
  }

  const amountKobo = Math.round(Number(amount) * 100);
  if (amountKobo < 100) {
    logger.warn('Paystack initializeTransaction: amount too small');
    return null;
  }

  try {
    const body = {
      email: email || `user@keke.app`,
      amount: amountKobo,
      currency: 'NGN',
      metadata: metadata || {},
    };
    if (callback_url) body.callback_url = callback_url;

    const { data } = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      body,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      }
    );

    if (data?.status && data?.data?.authorization_url) {
      return {
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
        access_code: data.data.access_code,
      };
    }
    logger.warn('Paystack initializeTransaction: unexpected response', data);
    return null;
  } catch (err) {
    logger.error(`Paystack initializeTransaction: ${err?.response?.data?.message || err.message}`);
    return null;
  }
}

/**
 * Verify a transaction by reference (e.g. after user returns from Paystack redirect)
 * GET https://api.paystack.co/transaction/verify/:reference
 * @param {string} reference - Paystack transaction reference
 * @returns {Promise<{ status: string, amount: number, metadata: object, reference: string }|null>}
 */
export async function verifyTransaction(reference) {
  const secretKey = getSecretKey();
  if (!secretKey || !reference) {
    return null;
  }
  try {
    const { data } = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      }
    );
    if (data?.status && data?.data?.status === 'success') {
      return {
        status: data.data.status,
        amount: data.data.amount,
        reference: data.data.reference,
        metadata: data.data.metadata || {},
      };
    }
    return null;
  } catch (err) {
    logger.error(`Paystack verifyTransaction: ${err?.response?.data?.message || err.message}`);
    return null;
  }
}

/**
 * List Nigerian banks (NUBAN) from Paystack — used for payout bank pickers.
 * Paginates until all pages are fetched (capped for safety).
 * @returns {Promise<Array<{ code: string, name: string, slug: string|null }>|null>} null on hard failure / no API key
 */
export async function listBanksNigeria() {
  const secretKey = getSecretKey();
  if (!secretKey) {
    logger.warn('Paystack: PAYSTACK_SECRET_KEY not set, skipping bank list');
    return null;
  }

  const collected = [];
  const seen = new Set();
  let page = 1;
  const perPage = 100;
  const maxPages = 30;

  try {
    while (page <= maxPages) {
      const { data } = await axios.get(`${PAYSTACK_BASE}/bank`, {
        params: {
          country: 'nigeria',
          perPage,
          page,
        },
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      });

      if (!data?.status || !Array.isArray(data.data)) {
        logger.warn('Paystack listBanksNigeria: unexpected response', data);
        break;
      }

      for (const b of data.data) {
        if (!b || b.active === false || b.is_deleted) continue;
        const code = b.code != null ? String(b.code) : '';
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        if (!code || !name || seen.has(code)) continue;
        seen.add(code);
        collected.push({
          code,
          name,
          slug: typeof b.slug === 'string' ? b.slug : null,
        });
      }

      const totalPages = Number(data.meta?.totalPages) || page;
      if (page >= totalPages) break;
      page += 1;
    }

    collected.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    return collected;
  } catch (err) {
    logger.error(`Paystack listBanksNigeria: ${err?.response?.data?.message || err.message}`);
    return null;
  }
}

/**
 * Resolve account name via Paystack NIBSS lookup.
 * @param {{ account_number: string, bank_code: string }} params
 * @returns {Promise<{ account_name?: string, account_number?: string, error?: string }>}
 */
export async function resolveAccountName({ account_number, bank_code }) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    return { error: 'paystack_unconfigured' };
  }

  const digits = String(account_number || '').replace(/\D/g, '');
  const code = String(bank_code || '').trim();
  if (digits.length !== 10) {
    return { error: 'Account number must be 10 digits' };
  }
  if (!code) {
    return { error: 'Bank code is required' };
  }

  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE}/bank/resolve`,
      { account_number: digits, bank_code: code },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: PAYSTACK_TIMEOUT_MS,
      }
    );

    if (data?.status && data?.data?.account_name) {
      return {
        account_name: String(data.data.account_name).trim(),
        account_number: data.data.account_number
          ? String(data.data.account_number).replace(/\D/g, '')
          : digits,
      };
    }

    const msg =
      typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : 'Could not verify account details.';
    return { error: msg };
  } catch (err) {
    const body = err?.response?.data;
    const msg =
      (typeof body?.message === 'string' && body.message.trim()) ||
      err?.message ||
      'Could not verify account details.';
    logger.warn(`Paystack resolveAccountName: ${msg}`);
    return { error: msg };
  }
}
