/**
 * Phone number normalization for Keke.
 *
 * Nigerian numbers are the dominant case for this app, so the normalizer
 * is Nigerian-aware: it produces canonical `+234XXXXXXXXXX` for any
 * input shape the user might enter — with country code, with the local
 * leading `0`, or as a bare 10-digit local number, optionally punctuated
 * with spaces, dashes, or brackets.
 *
 * Numbers that already carry a non-Nigerian country code (e.g. `+44 …`,
 * `+1 …`) are preserved after whitespace/punctuation is stripped, so
 * foreign users registered via Google/email later still work.
 *
 * STORAGE MIGRATION NOTE
 * Pre-existing users in production may have been stored under the legacy
 * digit-only form produced by the old `String(phone).replace(/\D/g, '')`
 * snippet that lived in every auth handler (e.g. `09035689338` or
 * `2349035689338`). Lookups MUST therefore go through `phoneVariants`,
 * which returns the canonical form plus every equivalent legacy shape,
 * so the duplicate check / login lookup still resolves old records to
 * the same user. New writes always go through `normalizePhone` so the
 * stored value converges on the canonical form over time.
 */

/**
 * Normalize a phone number to canonical form.
 *  - Strips spaces, dashes, brackets, and other punctuation.
 *  - Recognises a leading `+` so non-Nigerian E.164 numbers survive.
 *  - For Nigerian numbers, always returns `+234XXXXXXXXXX` (14 chars).
 *  - Returns `null` for empty / unparseable input.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizePhone(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const hadPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;

  // Nigerian: collapse all permitted shapes to +234XXXXXXXXXX
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  // Bare 10-digit local form ("9035689338") — only assume Nigerian when
  // the user did NOT type a `+` (which would indicate a foreign country
  // code we shouldn't second-guess).
  if (!hadPlus && digits.length === 10) return `+234${digits}`;

  // Non-Nigerian E.164 (caller supplied a `+`)
  if (hadPlus) return `+${digits}`;

  // Defensive fallback: return digits-as-is. The request validators
  // should already reject anything shorter than 10 digits, so this path
  // is mostly unreachable in normal use.
  return digits;
}

/**
 * Returns every equivalent representation of a phone number — useful
 * when looking up a user that may have been stored under a legacy
 * format before this normalizer existed. Always includes the canonical
 * form first.
 *
 * Pass the *raw* user input here; the function normalizes internally.
 *
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function phoneVariants(raw) {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];

  const variants = new Set([normalized]);

  // Nigerian alternates so legacy records still resolve.
  if (normalized.startsWith('+234') && normalized.length === 14) {
    const local = normalized.slice(4); // 10 digits, no leading 0
    variants.add(`234${local}`); // 2349035689338
    variants.add(`0${local}`); // 09035689338
    variants.add(local); // 9035689338 (defensive)
  }

  // Whatever the user typed, as a bare digit string, in case the
  // legacy code path (which called replace(/\D/g, '') everywhere)
  // stored it that way.
  const digitsOnly = String(raw).replace(/\D/g, '');
  if (digitsOnly) variants.add(digitsOnly);

  return [...variants];
}

/**
 * Compare two phones independent of formatting.
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
export function phonesMatch(a, b) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return !!na && na === nb;
}
