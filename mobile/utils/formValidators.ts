/**
 * Shared form validation helpers for on-blur / during-typing validation
 * Return error message string or undefined if valid
 */
const EMAIL_REGEX = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
const FULLNAME_REGEX = /^([A-Za-z'-]+)\s+([A-Za-z'-]+)$/;
/** Referral codes: 4–64 chars, alphanumeric (matches backend format) */
const REFERRAL_CODE_REGEX = /^[A-Za-z0-9]{4,64}$/;
/** Nigerian mobile: 0XXXXXXXXXX or +234XXXXXXXXXX (10 digits after country/local prefix) */
const NIGERIAN_PHONE_REGEX = /^(\+?234|0)[789][01]\d{8}$/;

export type Validator = (value: string) => string | undefined;

export const validators = {
  required: (msg = "This field is required"): Validator =>
    (v) => (!v?.trim() ? msg : undefined),

  email: (msg = "Enter a valid email"): Validator =>
    (v) => {
      if (!v?.trim()) return undefined; // empty = no error (use required for that)
      return EMAIL_REGEX.test(v.trim()) ? undefined : msg;
    },

  emailRequired: (msg = "Enter a valid email"): Validator =>
    (v) => {
      if (!v?.trim()) return "Email is required";
      return EMAIL_REGEX.test(v.trim()) ? undefined : msg;
    },

  password: (minLen = 6, msg?: string): Validator =>
    (v) => {
      if (!v?.trim()) return undefined;
      if (v.length < minLen)
        return msg ?? `Password must be at least ${minLen} characters`;
      return undefined;
    },

  passwordRequired: (minLen = 6): Validator =>
    (v) => {
      if (!v?.trim()) return "Password is required";
      if (v.length < minLen)
        return `Password must be at least ${minLen} characters`;
      return undefined;
    },

  fullname: (msg = "Enter first and last name separated by a space"): Validator =>
    (v) => {
      if (!v?.trim()) return undefined;
      return FULLNAME_REGEX.test(v.trim()) ? undefined : msg;
    },

  fullnameRequired: (msg = "Enter first and last name separated by a space"): Validator =>
    (v) => {
      if (!v?.trim()) return "Full name is required";
      return FULLNAME_REGEX.test(v.trim()) ? undefined : msg;
    },

  /** Optional field – if empty, valid. If filled, must be 4–64 alphanumeric chars. */
  referralCode: (msg = "Referral code must be 4–64 letters or numbers"): Validator =>
    (v) => {
      const trimmed = v?.trim() ?? "";
      if (!trimmed) return undefined;
      return REFERRAL_CODE_REGEX.test(trimmed) ? undefined : msg;
    },

  nigerianPhone: (
    msg = "Enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)"
  ): Validator =>
    (v) => {
      if (!v?.trim()) return undefined;
      return NIGERIAN_PHONE_REGEX.test(v.replace(/\s/g, "")) ? undefined : msg;
    },

  nigerianPhoneRequired: (
    msg = "Enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)"
  ): Validator =>
    (v) => {
      if (!v?.trim()) return "Phone number is required";
      return NIGERIAN_PHONE_REGEX.test(v.replace(/\s/g, "")) ? undefined : msg;
    },

  compose: (...fns: Validator[]): Validator =>
    (v) => {
      for (const fn of fns) {
        const err = fn(v);
        if (err) return err;
      }
      return undefined;
    },
};
