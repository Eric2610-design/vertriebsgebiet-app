export type CountryCode = "DE" | "AT" | "CH";

// Very rough bounding boxes. Good enough to catch obvious wrong-country geocodes.
// Values are (minLat, maxLat, minLng, maxLng)
const BOUNDS: Record<CountryCode, [number, number, number, number]> = {
  DE: [47.27, 55.06, 5.87, 15.04],
  AT: [46.37, 49.02, 9.53, 17.16],
  CH: [45.82, 47.81, 5.96, 10.49],
};

export function normalizeCountry(input: string | null | undefined): CountryCode | null {
  if (!input) return null;
  const v = String(input).trim().toUpperCase();
  if (!v) return null;
  if (v === "DE" || v.includes("GERMANY") || v.includes("DEUTSCH")) return "DE";
  if (v === "AT" || v.includes("AUSTRIA") || v.includes("ÖSTER") || v.includes("OESTER")) return "AT";
  if (v === "CH" || v.includes("SWITZER") || v.includes("SCHWE")) return "CH";
  return null;
}

export function coordsMatchCountry(country: string | null | undefined, lat: number, lng: number): {
  ok: boolean;
  code: CountryCode | null;
} {
  const code = normalizeCountry(country);
  if (!code) return { ok: true, code: null }; // unknown/unsupported -> do not block
  const [minLat, maxLat, minLng, maxLng] = BOUNDS[code];
  const ok = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  return { ok, code };
}
