/**
 * Format raw address (e.g. from Google) for ride-hailing style display.
 * Strips plus codes, splits into primary (street/place) and secondary (area, city).
 */

export interface FormattedAddress {
  primary: string;
  secondary: string;
  /** One-line for inputs: "Primary · Secondary" */
  full: string;
}

/**
 * Clean and split address for Bolt/Uber-style display.
 * - Removes plus codes (e.g. 84F7+MFJ)
 * - Primary = street/place name (bold)
 * - Secondary = area + city (light/small)
 */
export function formatAddressForDisplay(address: string | null | undefined): FormattedAddress {
  if (!address || typeof address !== "string") {
    return { primary: "", secondary: "", full: "" };
  }

  const trimmed = address.trim();
  if (!trimmed) return { primary: "", secondary: "", full: "" };

  // Remove plus codes like "84F7+MFJ," or "84F7+MFJ " at the start
  const cleaned = trimmed.replace(/^[A-Z0-9+]+\s*,?\s*/i, "").trim();

  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);

  let primary = parts[0] ?? "";
  let secondary = parts.slice(1, 3).join(", ").trim();

  // Unnamed Road / generic fallback: use secondary as primary if it's more meaningful
  if (
    primary &&
    (primary.toLowerCase().includes("unnamed") || primary.toLowerCase() === "road")
  ) {
    if (secondary) {
      primary = secondary;
      secondary = parts.slice(2, 4).join(", ").trim();
    }
  }

  const full = secondary ? `${primary} · ${secondary}` : primary;

  return { primary, secondary, full };
}
