import mongoose from 'mongoose';
import logger from './logger.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 8;
export const REFERRAL_CODE_MAX_ATTEMPTS = 5;

const MISSING_CODE = 'Could not generate a unique referral code';

function defaultCandidate() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

let candidateGenerator = defaultCandidate;

export function generateReferralCodeCandidate() {
  return candidateGenerator();
}

/** Swap the candidate generator. Returns a function that restores the previous one. */
export function useReferralCodeGenerator(fn) {
  const previous = candidateGenerator;
  candidateGenerator = typeof fn === 'function' ? fn : defaultCandidate;
  return () => {
    candidateGenerator = previous;
  };
}

function giveUp(detail) {
  logger.error(detail);
  const error = new Error(MISSING_CODE);
  error.statusCode = 500;
  throw error;
}

/**
 * 8-character code that is not already stored on a user.
 * Gives up after 5 collisions.
 */
export async function generateUniqueReferralCode() {
  const User = mongoose.model('User');
  for (let attempt = 1; attempt <= REFERRAL_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateReferralCodeCandidate();
    const taken = await User.exists({ referralCode: code });
    if (!taken) return code;
  }
  giveUp(`Referral code collided ${REFERRAL_CODE_MAX_ATTEMPTS} times`);
}

/**
 * Assign a code only when the user still has none.
 * Concurrent callers cannot each write a different code: the filter matches
 * an empty code, so the first update wins and the rest read that code back.
 */
export async function assignReferralCodeIfMissing(userId) {
  const User = mongoose.model('User');
  for (let attempt = 1; attempt <= REFERRAL_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = await generateUniqueReferralCode();
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, referralCode: { $in: [null, undefined, ''] } },
        { $set: { referralCode: code } },
        { new: true }
      );
      if (updated) return updated;
      return User.findById(userId);
    } catch (err) {
      if (err?.code !== 11000 || attempt === REFERRAL_CODE_MAX_ATTEMPTS) {
        if (err?.code === 11000) {
          giveUp(`Referral code assignment collided for user ${userId}`);
        }
        throw err;
      }
    }
  }
  return mongoose.model('User').findById(userId);
}

/** Prize fields from settings.referral — same defaults as getReferralProgram. */
export function referralRewardFromSettings(settings) {
  const ref = settings?.referral || {};
  const rewardType = ref.rewardType || 'free_ride';
  const required = ref.successfulInvitesRequired ?? 3;
  const cashAmount = ref.cashAmount ?? 500;
  const freeRideAmount = ref.freeRideAmount ?? 1000;
  const rewardAmount = rewardType === 'cash' ? cashAmount : freeRideAmount;
  return {
    reward_type: rewardType,
    reward_amount: rewardAmount,
    successful_invites_required: required,
    description:
      ref.description ||
      'Invite friends! When they complete signup and their first ride, you get a reward.',
    updated_at: ref.updatedAt || settings?.updatedAt || null,
  };
}
