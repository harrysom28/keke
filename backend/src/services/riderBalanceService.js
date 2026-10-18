/**
 * Rider wallet service — the ONLY place that changes a rider's spendable balance.
 *
 * Source of truth: UserWallet (userType 'rider').availableBalance. A booking holds and spends from it.
 * User.balance is a legacy MIRROR for old app builds and old readers; it is written here (best effort) and never
 * read to decide whether money is spendable.
 *
 * Invariants
 *  - Every rider has exactly one wallet (ensureRiderWallet is idempotent and race-safe; the unique index on
 *    userId is the arbiter). A new wallet is seeded from User.balance, exactly as the first booking used to do.
 *  - Every credit/debit is one atomic update on the wallet plus one UserWalletTransaction row.
 *  - Credits/debits that can be retried carry an idempotencyKey. The ledger row is claimed FIRST (unique index),
 *    so a retry or a concurrent twin can never move money twice, with or without Mongo transactions.
 *  - A row left 'pending' (process died between claim and balance update) is found by the reconcile scripts.
 *
 * Never user.save() a partly loaded User: its pre('validate') needs phone/email and throws.
 */
import mongoose from 'mongoose';
import User from '../models/User.js';
import UserWallet from '../models/UserWallet.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import logger from '../utils/logger.js';

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'object' && id?._id) return toObjectId(id._id);
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) throw new Error('rider wallet: invalid user id');
  return new mongoose.Types.ObjectId(s);
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function assertAmount(amount, label = 'amount') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`rider wallet: invalid ${label} ${amount}`);
  return round2(n);
}

/**
 * Get the rider's wallet, creating it (seeded from User.balance) if missing. Safe to call concurrently.
 */
export async function ensureRiderWallet(userId, { session = null } = {}) {
  const uid = toObjectId(userId);
  const opts = session ? { session } : {};
  const found = await UserWallet.findOne({ userId: uid }, null, opts);
  if (found) return found;

  const user = await User.findById(uid, 'balance', opts).lean();
  if (!user) throw new Error('rider wallet: user not found');
  const seed = Math.max(0, round2(Number(user.balance) || 0));
  try {
    return await UserWallet.findOneAndUpdate(
      { userId: uid },
      { $setOnInsert: { userId: uid, userType: 'rider', availableBalance: seed, heldBalance: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }
    );
  } catch (err) {
    if (err?.code === 11000) return UserWallet.findOne({ userId: uid }, null, opts); // lost the race: use the winner
    throw err;
  }
}

/**
 * Best-effort legacy mirror: copies the wallet's CURRENT availableBalance into User.balance. Reading the wallet
 * (instead of trusting the value one caller computed) means two concurrent operations cannot leave the mirror stale.
 * A failure here must never fail or undo a money movement.
 */
async function mirrorUserBalance(uid, opts) {
  try {
    const w = await UserWallet.findOne({ userId: uid }, 'availableBalance', opts).lean();
    if (!w) return;
    await User.updateOne({ _id: uid }, { $set: { balance: round2(w.availableBalance) } }, opts);
  } catch (err) {
    logger.warn(`rider wallet: User.balance mirror failed for ${uid}: ${err.message}`);
  }
}

/**
 * Re-sync the legacy User.balance mirror from the wallet. The only other writer of User.balance for riders:
 * escrow holds/releases change availableBalance directly and call this afterwards.
 */
export async function syncRiderMirror(userId, { session = null } = {}) {
  await mirrorUserBalance(toObjectId(userId), session ? { session } : {});
}

/**
 * Claim the idempotency key by inserting the ledger row as 'pending' (unique sparse index on idempotencyKey).
 * Returns { row, duplicate }. When duplicate, `row` is the existing row.
 */
async function claimLedgerRow(fields, opts) {
  const key = fields.idempotencyKey;
  if (key) {
    // Look first: inside a Mongo transaction a duplicate-key error aborts the whole transaction, so the common
    // "already claimed" case must not be discovered by an insert error.
    const existing = await UserWalletTransaction.findOne({ idempotencyKey: key }, null, opts);
    if (existing) return takeOverOrDuplicate(existing, fields, opts);
  }
  try {
    const [row] = await UserWalletTransaction.create([fields], opts);
    return { row, duplicate: false };
  } catch (err) {
    if (err?.code === 11000 && key) {
      // Lost a race with a concurrent twin that inserted between our look and our insert.
      const existing = await UserWalletTransaction.findOne({ idempotencyKey: key }, null, opts);
      if (existing) return takeOverOrDuplicate(existing, fields, opts);
    }
    throw err;
  }
}

/**
 * A previous attempt that FAILED (the update threw, no money moved) must not block a retry: take the row back over.
 * The conditional update is atomic, so exactly one of several concurrent retries wins it.
 * A 'pending' row (process died mid-update) or a 'completed' row is a duplicate and is never retried here.
 */
async function takeOverOrDuplicate(existing, fields, opts) {
  if (existing.status === 'failed') {
    const retaken = await UserWalletTransaction.findOneAndUpdate(
      { _id: existing._id, status: 'failed' },
      { $set: { status: 'pending', amount: fields.amount, description: fields.description } },
      { new: true, ...opts }
    );
    if (retaken) return { row: retaken, duplicate: false };
    const now = await UserWalletTransaction.findOne({ _id: existing._id }, null, opts);
    return { row: now || existing, duplicate: true };
  }
  return { row: existing, duplicate: true };
}

/**
 * Add money to a rider's spendable balance.
 * @param {string|ObjectId} userId
 * @param {number} amountNaira  > 0
 * @param {object} [o]
 * @param {string} [o.type='refund']   UserWalletTransaction type (topup|refund|reward|change_return|admin_adjustment|reconciliation|fare_credit)
 * @param {string} [o.description]
 * @param {string} [o.idempotencyKey]  exactly-once key (strongly recommended for anything that can be retried)
 * @param {string|ObjectId} [o.rideId]
 * @param {string} [o.providerRef]
 * @param {ClientSession} [o.session]
 * @returns {Promise<{ balanceAfter:number, credited:boolean, walletExists:true }>}
 */
export async function creditRiderBalance(userId, amountNaira, o = {}) {
  const amount = assertAmount(amountNaira);
  const uid = toObjectId(userId);
  const opts = o.session ? { session: o.session } : {};
  const type = o.type || 'refund';

  const wallet = await ensureRiderWallet(uid, opts);
  const claim = await claimLedgerRow(
    {
      userId: uid,
      rideId: o.rideId ? toObjectId(o.rideId) : null,
      type,
      amount,
      description: o.description || `Wallet credit (${type})`,
      providerRef: o.providerRef || null,
      status: 'pending',
      ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}),
    },
    opts
  );
  if (claim.duplicate) {
    const current = await UserWallet.findOne({ userId: uid }, 'availableBalance', opts).lean();
    return { balanceAfter: Number(current?.availableBalance) || 0, credited: false, walletExists: true, pending: claim.row?.status === 'pending' };
  }

  let updated;
  try {
    updated = await UserWallet.findOneAndUpdate(
      { _id: wallet._id },
      { $inc: { availableBalance: amount } },
      { new: true, ...opts }
    );
  } catch (err) {
    // The update threw, so no money moved: release the key so a retry is not mistaken for a duplicate.
    await UserWalletTransaction.updateOne({ _id: claim.row._id }, { $set: { status: 'failed' } }, opts).catch(() => {});
    throw err;
  }
  if (!updated) {
    await UserWalletTransaction.updateOne({ _id: claim.row._id }, { $set: { status: 'failed' } }, opts).catch(() => {});
    throw new Error('rider wallet: credit failed (wallet missing)');
  }
  const after = round2(updated.availableBalance);
  await UserWalletTransaction.updateOne(
    { _id: claim.row._id },
    { $set: { status: 'completed', balanceBefore: round2(after - amount), balanceAfter: after } },
    opts
  );
  await mirrorUserBalance(uid, opts);
  return { balanceAfter: after, credited: true, walletExists: true };
}

/**
 * Take money out of a rider's spendable balance. Atomic guard: never goes below zero, never on a frozen wallet.
 * @throws {Error} with code 'INSUFFICIENT_BALANCE' | 'WALLET_FROZEN'
 */
export async function debitRiderBalance(userId, amountNaira, o = {}) {
  const amount = assertAmount(amountNaira);
  const uid = toObjectId(userId);
  const opts = o.session ? { session: o.session } : {};
  const type = o.type || 'fare_debit';

  const wallet = await ensureRiderWallet(uid, opts);
  const claim = await claimLedgerRow(
    {
      userId: uid,
      rideId: o.rideId ? toObjectId(o.rideId) : null,
      type,
      amount: -amount,
      description: o.description || `Wallet debit (${type})`,
      providerRef: o.providerRef || null,
      status: 'pending',
      ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}),
    },
    opts
  );
  if (claim.duplicate) {
    const current = await UserWallet.findOne({ userId: uid }, 'availableBalance', opts).lean();
    return { balanceAfter: Number(current?.availableBalance) || 0, debited: false, pending: claim.row?.status === 'pending' };
  }

  let updated;
  try {
    updated = await UserWallet.findOneAndUpdate(
      { _id: wallet._id, frozen: { $ne: true }, availableBalance: { $gte: amount } },
      { $inc: { availableBalance: -amount } },
      { new: true, ...opts }
    );
  } catch (err) {
    await UserWalletTransaction.updateOne({ _id: claim.row._id }, { $set: { status: 'failed' } }, opts).catch(() => {});
    throw err;
  }
  if (!updated) {
    await UserWalletTransaction.updateOne({ _id: claim.row._id }, { $set: { status: 'failed' } }, opts).catch(() => {});
    const now = await UserWallet.findOne({ _id: wallet._id }, 'frozen availableBalance', opts).lean();
    const err = new Error(now?.frozen ? 'Wallet is frozen' : 'Insufficient wallet balance');
    err.code = now?.frozen ? 'WALLET_FROZEN' : 'INSUFFICIENT_BALANCE';
    throw err;
  }
  const after = round2(updated.availableBalance);
  await UserWalletTransaction.updateOne(
    { _id: claim.row._id },
    { $set: { status: 'completed', balanceBefore: round2(after + amount), balanceAfter: after } },
    opts
  );
  await mirrorUserBalance(uid, opts);
  return { balanceAfter: after, debited: true };
}

/**
 * Admin / reconciliation adjustment (signed). Always leaves a ledger row naming who did it and why.
 */
export async function adjustRiderBalance(userId, deltaNaira, { reason, adminId = null, type = 'admin_adjustment', idempotencyKey } = {}) {
  if (!reason || !String(reason).trim()) throw new Error('rider wallet: a reason is required for an adjustment');
  const delta = round2(deltaNaira);
  if (!Number.isFinite(delta) || delta === 0) throw new Error('rider wallet: adjustment must be a non-zero number');
  const description = `${type === 'reconciliation' ? 'Reconciliation' : 'Admin adjustment'}${adminId ? ` by ${adminId}` : ''}: ${String(reason).trim()}`;
  return delta > 0
    ? creditRiderBalance(userId, delta, { type, description, idempotencyKey })
    : debitRiderBalance(userId, -delta, { type, description, idempotencyKey });
}

/**
 * What the rider can spend / has locked. Wallet is truth; User.balance is used only if the wallet cannot be read.
 */
export async function getRiderBalance(userId) {
  const uid = toObjectId(userId);
  const wallet = await UserWallet.findOne({ userId: uid }, 'availableBalance heldBalance').lean();
  if (wallet) {
    const available = Number(wallet.availableBalance) || 0;
    const held = Number(wallet.heldBalance) || 0;
    return { available, held, total: available + held, source: 'wallet' };
  }
  const user = await User.findById(uid, 'balance').lean();
  const available = Number(user?.balance) || 0;
  return { available, held: 0, total: available, source: 'user' };
}
