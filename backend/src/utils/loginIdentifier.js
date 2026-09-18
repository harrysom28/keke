import { normalizePhone, phoneVariants } from './phone.js';

/**
 * Parse the polymorphic email-or-phone field used across auth.
 */
export function parseLoginIdentifier(emailPhone) {
  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const value = String(emailPhone ?? '').trim();
  const isEmail = emailRegex.test(value);
  return {
    isEmail,
    email: isEmail ? value.toLowerCase() : undefined,
    phone: isEmail ? undefined : normalizePhone(value) || undefined,
    phoneQuery: isEmail ? [] : phoneVariants(value),
  };
}

export async function findUserByIdentifier(User, emailPhone) {
  const parsed = parseLoginIdentifier(emailPhone);
  const { email, phoneQuery } = parsed;
  if (!email && !phoneQuery.length) {
    return { user: null, parsed };
  }
  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });
  return { user, parsed };
}
