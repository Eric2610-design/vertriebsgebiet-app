import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

function normStreetSoft(raw: string | null) {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function identityKey(name: string, street: string | null, zip: string | null, city: string | null) {
  const n = normText(name ?? "");
  const s = normStreetSoft(street);
  const z = (zip ?? "").trim();
  const c = normText(city ?? "");
  return [n, s, z, c].join("|");
}


function digitsOnly(v: any): string {
  return String(v ?? "").replace(/\D+/g, "").trim();
}

function inferCountryAndZip(zipRaw: any, cityRaw: any, countryRaw: any) {
  const city = String(cityRaw ?? "").trim().toLowerCase();
  let zip = digitsOnly(zipRaw);
  let country = String(countryRaw ?? "").trim();

  const atCities = [
    "wien","graz","linz","salzburg","innsbruck","klagenfurt","villach","st. pölten","sankt pölten",
    "wels","dornbirn","bregenz","feldkirch","wiener neustadt"
  ];
  const cityLooksAT = atCities.some(c => city.includes(c));

  if (!country) {
    if (zip.length === 5) country = "Deutschland";
    else if (zip.length === 4) {
      country = cityLooksAT ? "Österreich" : "Deutschland";
      if (country === "Deutschland") zip = zip.padStart(5, "0");
    }
  }

  const cNorm = country.toLowerCase();
  if (zip) {
    if (cNorm.includes("öster") || cNorm === "at" || cNorm === "aut" || cNorm.includes("austria")) {
      zip = zip.padStart(4, "0").slice(-4);
      country = "Österreich";
    } else if (cNorm.includes("deut") || cNorm === "de" || cNorm === "deu" || cNorm.includes("germany")) {
      zip = zip.padStart(5, "0").slice(-5);
      country = "Deutschland";
    }
  }
  return { zip: zip || null, country: country || null };
}


export async function POST() {
  try {
    const sb = supabaseService();
    const step = 500;
    let from = 0;
    let scanned = 0;
    let updated = 0;
    let skipped_collisions = 0;
    let country_filled = 0;
    let zip_padded = 0;

    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,zip,city,country,norm_name,norm_street,norm_city,identity_key")
        .range(from, from + step - 1);

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      scanned += data.length;

      for (const d of data as any[]) {
        const nn = normText(d.name ?? "");
        const ns = normStreetSoft(d.street ?? "");
        const nc = normText(d.city ?? "");
        const inf = inferCountryAndZip(d.zip, d.city, d.country);
        const zip2 = inf.zip;
        const country2 = inf.country;
        const ik = identityKey(d.name ?? "", d.street ?? null, zip2, d.city ?? null);

        if (d.norm_name !== nn || d.norm_street !== ns || d.norm_city !== nc || d.identity_key !== ik || (zip2 && String(d.zip ?? '') !== String(zip2)) || (country2 && String(d.country ?? '') !== String(country2))) {
          // If a unique constraint exists on (norm_name, norm_street, zip, norm_city),
// an update could fail when two rows become identical after normalization.
// We therefore pre-check and skip those collisions (they remain as-is and can be merged manually).
const { data: coll, error: cerr } = await sb
  .from("dealers")
  .select("id")
  .eq("norm_name", nn)
  .eq("norm_street", ns)
  .eq("zip", zip2 ?? (d.zip ?? ""))
  .eq("norm_city", nc)
  .neq("id", d.id)
  .limit(1);

if (cerr) return bad(cerr.message, 500);
if (coll && coll.length > 0) {
  skipped_collisions++;
} else {
  const { error: uerr } = await sb
    .from("dealers")
    .update({ norm_name: nn, norm_street: ns, norm_city: nc, identity_key: ik, ...(zip2 && String(d.zip ?? "") !== String(zip2) ? { zip: zip2 } : {}), ...(country2 && !String(d.country ?? "").trim() ? { country: country2 } : {}) })
    .eq("id", d.id);

  if (uerr) {
    // If normalization would violate unique constraints, skip the row (it can be merged manually).
    if (/dealers_norm_unique/i.test(uerr.message) || /duplicate key value/i.test(uerr.message)) {
      skipped_collisions++;
      continue;
    }
    return bad(uerr.message, 500);
  }
  if (zip2 && String(d.zip ?? "") !== String(zip2)) zip_padded++;
  if (country2 && !String(d.country ?? "").trim()) country_filled++;
  updated++;
}
        }
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ scanned, updated, skipped_collisions, zip_padded, country_filled });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}