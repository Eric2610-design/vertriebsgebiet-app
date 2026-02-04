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

  // typische Schreibweisen angleichen
  return s
    .replace(/\bstr\.\b/g, "strasse")
    .replace(/\bstr\b/g, "strasse")
    .replace(/\bstraße\b/g, "strasse")
    .replace(/\bstraess?e\b/g, "strasse")
    .replace(/\s+/g, " ")
    .trim();
}
