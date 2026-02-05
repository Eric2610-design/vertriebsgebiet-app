export function normText(input: unknown): string {
  let s = String(input ?? "").trim().toLowerCase();
  // normalize umlauts/diacritics
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/ß/g, "ss");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function normStreet(input: unknown): string {
  let s = String(input ?? "").trim().toLowerCase();
  s = s.replace(/straße/g, "strasse");
  s = s.replace(/\bstr\.?\b/g, "strasse");
  s = s.replace(/\bstrasse\b/g, "strasse");
  // common spacing for house numbers
  s = s.replace(/(\d)([a-z])/g, "$1 $2");
  return normText(s);
}

export function identityKey(d: { name?: any; street?: any; zip?: any; city?: any; country?: any }) {
  // country is optional in identity (so reimports with missing country still match)
  return [
    normText(d.name ?? ""),
    normStreet(d.street ?? ""),
    String(d.zip ?? "").trim(),
    normText(d.city ?? ""),
  ].join("|");
}
