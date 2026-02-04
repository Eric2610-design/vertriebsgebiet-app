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
