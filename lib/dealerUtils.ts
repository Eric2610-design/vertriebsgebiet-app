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

// Etwas strengere Normalisierung speziell für Straßen.
// Wichtig fürs Dedupe: "Str.", "Strasse", "Straße" sollen zusammenfallen.
export function normStreet(v: any) {
  const s = norm(v);

  return s
    .replace(/\bstr\.\b/g, "strasse")
    .replace(/\bstr\b/g, "strasse")
    .replace(/\bstraße\b/g, "strasse")
    .replace(/\bstraess?e\b/g, "strasse")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * dealerKey() wird von /app/api/dealers/stats/route.ts genutzt.
 * Muss stabil sein und mit dem dedupe_key-Format übereinstimmen.
 */
export function dealerKey(input: {
  name?: any;
  street?: any;
  zipcode?: any;
  postal_code?: any;
  city?: any;
}) {
  const name = input?.name ?? "";
  const street = input?.street ?? "";
  const zipcode = input?.zipcode ?? input?.postal_code ?? "";
  const city = input?.city ?? "";

  return `${norm(name)}|${normStreet(street)}|${norm(zipcode)}|${norm(city)}`;
}
