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
function digitsOnly(s: string) {
  return (s ?? "").replace(/\D+/g, "");
}

function inferCountryAndZip(zip: string | null, city: string | null, provided: string | null) {
  const pRaw = String(provided ?? "").trim();
  if (pRaw) {
    const zd = digitsOnly(String(zip ?? "").trim());
    const pc = pRaw.toLowerCase();
    if (pc.includes("öster") || pc.includes("austr") || pc === "at" || pc === "aut") {
      return { country: "Österreich", zip: zd ? zd.padStart(4, "0") : (zip ?? null) };
    }
    if (pc.includes("deut") || pc.includes("germ") || pc === "de" || pc === "deu") {
      return { country: "Deutschland", zip: zd ? zd.padStart(5, "0") : (zip ?? null) };
    }
    return { country: pRaw, zip: zd || (zip ?? null) };
  }

  const zd = digitsOnly(String(zip ?? "").trim());
  const c = String(city ?? "").trim().toLowerCase();

  const atCities = new Set([
    "wien","graz","linz","salzburg","innsbruck","klagenfurt","villach","wels","st. pölten","st. poelten",
    "dornbirn","feldkirch","bregenz","steyr","leoben","kapfenberg","baden","krems","amstetten",
    "wiener neustadt","wr. neustadt","wienerneustadt","traun","lustenau","schwechat"
  ]);

  if (/^\d{5}$/.test(zd)) return { country: "Deutschland", zip: zd };
  if (/^\d{4}$/.test(zd)) {
    if (c && atCities.has(c)) return { country: "Österreich", zip: zd };
    return { country: "Deutschland", zip: zd.padStart(5, "0") };
  }

  if (c && atCities.has(c)) return { country: "Österreich", zip: zd || (zip ?? null) };
  if (c) return { country: "Deutschland", zip: zd || (zip ?? null) };

  return { country: null, zip: zd || (zip ?? null) };
}

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
    let skipped_collisions = 0;

    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,zip,city,country,norm_name,norm_street,norm_city,identity_key")
        .range(from, from + step - 1);

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      scanned += data.length;

      for (const d of data as any[]) {
        const inferred = inferCountryAndZip(d.zip ?? null, d.city ?? null, d.country ?? null);
const zipFixed = (inferred.zip ?? d.zip ?? null) as any;
const countryFixed = (d.country && String(d.country).trim() ? d.country : (inferred.country ?? null)) as any;

const nn = normText(d.name ?? "");
const ns = normStreetSoft(d.street ?? "");
const nc = normText(d.city ?? "");
const ik = identityKey(d.name ?? "", d.street ?? null, zipFixed ?? null, d.city ?? null);

        if (d.norm_name !== nn || d.norm_street !== ns || d.norm_city !== nc || d.identity_key !== ik || (zipFixed ?? null) !== (d.zip ?? null) || (countryFixed ?? null) !== (d.country ?? null)) {
          // If a unique constraint exists on (norm_name, norm_street, zip, norm_city),
// an update could fail when two rows become identical after normalization.
// We therefore pre-check and skip those collisions (they remain as-is and can be merged manually).
const { data: coll, error: cerr } = await sb
  .from("dealers")
  .select("id")
  .eq("norm_name", nn)
  .eq("norm_street", ns)
  .eq("zip", zipFixed ?? "")
  .eq("norm_city", nc)
  .neq("id", d.id)
  .limit(1);

if (cerr) return bad(cerr.message, 500);
if (coll && coll.length > 0) {
  skipped_collisions++;
} else {
  
if ((d.country ?? null) !== (countryFixed ?? null) && !d.country && countryFixed) country_filled++;
if ((d.zip ?? null) !== (zipFixed ?? null) && zipFixed) zip_padded++;

  const { error: uerr } = await sb
    .from("dealers")
    .update({ norm_name: nn, norm_street: ns, norm_city: nc, identity_key: ik, zip: zipFixed ?? null, country: countryFixed ?? null })
    .eq("id", d.id);

  if (uerr) return bad(uerr.message, 500);
  updated++;
}
        }
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ scanned, updated, skipped_collisions, country_filled, zip_padded });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}
