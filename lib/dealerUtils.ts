export type Dealer = {
  id: number;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;

  // intern (muss nicht angezeigt werden)
  source?: string | null;

  // Marken, die der Händler führt
  brands?: string[] | null;

  lat?: number | null;
  lng?: number | null;

  // Dubletten
  is_master?: boolean | null;
  duplicate_of?: number | null;

  notes?: string | null;
  geocode_status?: string | null;
  geocode_error?: string | null;
};

/** Normalisierung für Texte (Name, Ort, PLZ etc.) */
export function norm(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/** Normalisierung speziell für Straßen */
export function normStreet(v: any) {
  return norm(v)
    .replace(/\./g, "")
    .replace(/\b(strasse|straße|str)\b/g, "str")
    .replace(/\b(platz|pl)\b/g, "pl")
    .replace(/\b(allee|al)\b/g, "al");
}

/** Dedupe-Key: Name + Straße + PLZ + Ort */
export function dealerKey(d: Partial<Dealer>) {
  return `${norm(d.name)}|${normStreet(d.street)}|${norm(d.zipcode ?? d.postal_code)}|${norm(d.city)}`;
}

export function prettyAddress(d: Partial<Dealer>) {
  const a = [
    d.street,
    [d.zipcode ?? d.postal_code, d.city].filter(Boolean).join(" "),
    d.country,
  ]
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
  return a || "—";
}

export function hostFromWebsite(w?: string | null) {
  if (!w) return null;
  try {
    const u = new URL(w.startsWith("http") ? w : `https://${w}`);
    return u.hostname;
  } catch {
    return w;
  }
}

export function uniqueSorted(arr: (string | null | undefined)[]) {
  const out = Array.from(new Set((arr ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b, "de"));
  return out;
}
