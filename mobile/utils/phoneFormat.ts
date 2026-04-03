/**
 * Phone display/storage format: store +234, show 0.
 * DB keeps canonical international format (+2349035689338).
 * UI shows local format (09035689338) everywhere.
 */

/** Format stored phone for UI: +2349035689338 → 09035689338 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  const stripped = phone.replace(/^\+?234/, "").trim();
  if (!stripped) return "";
  return stripped.startsWith("0") ? stripped : "0" + stripped;
}

/** Normalise user input for storage: 09035689338 → +2349035689338 */
export function normalisePhoneForStorage(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return "+" + digits;
  if (digits.startsWith("0")) return "+234" + digits.slice(1);
  return "+234" + digits;
}
