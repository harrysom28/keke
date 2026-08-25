const PLAY_STORE_LISTING =
  "https://play.google.com/store/apps/details?id=com.kekeride.app";

/** Dead/legacy invite hosts or the pre-rename Android package. */
function isStaleInviteUrl(url: string): boolean {
  return (
    url.includes("app.keke.com") ||
    url.includes("id=com.keke.app")
  );
}

/**
 * URL attached to Invite a Friend shares. Prefers the API value unless it still
 * points at the old (unresolved) host or the retired Play package.
 */
export function inviteShareUrl(
  referralUrl: string | null | undefined,
  referralCode: string | null | undefined
): string {
  const fromApi = typeof referralUrl === "string" ? referralUrl.trim() : "";
  if (fromApi && !isStaleInviteUrl(fromApi)) {
    return fromApi;
  }
  const code = typeof referralCode === "string" ? referralCode.trim() : "";
  if (!code) return PLAY_STORE_LISTING;
  const referrer = encodeURIComponent(
    `utm_source=invite&utm_medium=share&utm_content=${code}`
  );
  return `${PLAY_STORE_LISTING}?referrer=${referrer}`;
}
