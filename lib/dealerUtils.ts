export type Dealer = {
  id: number;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_master?: boolean | null;
  duplicate_of?: number | null;
  notes?: string | null;
};

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

// Straße separat normalisieren (Str./Straße, Sonderzeichen, Mehrfach-Leerzeichen, Bindestriche).
// Wird für Dedupe-Keys genutzt, damit Filialen sauber getrennt werden, aber Schreibvarianten stabil bleiben.
export function normStreet(v: any) {
  return norm(v)
    // "str." / "str" / "straße" / "strasse" vereinheitlichen
    .replace(/\bstr\.?\b/g, "strasse")
    .replace(/\bstraße\b/g, "strasse")
    // häufige Trenner vereinheitlichen
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+\./g, ".")
    .replace(/\.+/g, ".")
    // alles außer Buchstaben/Zahlen/Leerzeichen/-/./,/\ entfernen
    .replace(/[^a-z0-9\s\-\.\,\/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function dealerKey(d: Partial<Dealer>) {
  return `${norm(d.name)}|${norm(d.zipcode)}|${norm(d.city)}`;
}

export function prettyAddress(d: Partial<Dealer>) {
  const a = [d.street, [d.zipcode, d.city].filter(Boolean).join(" "), d.country]
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
