/**
 * Remove emoji / pictographs from notification copy (legacy rows still include them).
 */
export function stripNotificationEmojis(text: string | undefined | null): string {
  if (!text) return "";
  return String(text)
    // Extended pictographs, symbols, transport, flags, etc.
    .replace(
      /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+/gu,
      ""
    )
    // Variation selectors / ZWJ leftovers
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
