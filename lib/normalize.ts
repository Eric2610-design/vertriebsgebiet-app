export function normText(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cleans a dealer name for display/export.
 * Handles common import artifacts (e.g. trailing "      Z").
 */
export function cleanDealerName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s{2,}z\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitFlyerCustomer(raw: string): { externalId?: string; name: string } {
  const m = String(raw ?? "").match(/^\s*(\d+)\s*-\s*(.+)$/);
  if (m) return { externalId: m[1], name: m[2].trim() };
  return { name: String(raw ?? "").trim() };
}

export function joinAddress(street?: string|null, zip?: string|null, city?: string|null, country?: string|null) {
  return [street, zip, city, country].filter(Boolean).join(", ");
}
