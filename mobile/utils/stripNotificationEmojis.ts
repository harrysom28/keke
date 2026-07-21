/**
 * Remove emoji / pictographs from notification copy (legacy rows still include them).
 *
 * Do NOT use `\p{Emoji_Component}` — Unicode marks digits 0–9 as emoji components
 * (for keycaps), which would strip amounts like "₦1,500" down to "₦,".
 */
export function stripNotificationEmojis(text: string | undefined | null): string {
  if (!text) return "";
  return String(text)
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
