import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

const ItemSchema = z.object({
  dealer: z.object({
    name: z.string().min(1),
    street: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    opening_hours: z.string().nullable().optional(),
  }),
  sources: z
    .array(
      z.object({
        source: z.string().min(1),
        external_id: z.string().nullable().optional(),
        source_url: z.string().nullable().optional(),
      })
    )
    .default([]),
});

const BodySchema = z.object({ items: z.array(ItemSchema).max(20000) });

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
  const n = normText(name);
  const s = normStreetSoft(street);
  const z = (zip ?? "").trim();
  const c = normText(city ?? "");
  return [n, s, z, c].join("|");
}


function inferCountry(zip: string | null, city: string | null, provided: string | null) {
  const p = String(provided ?? "").trim();
  if (p) return p;
  const z = String(zip ?? "").trim();
  // DE: 5-stellige PLZ, AT: 4-stellige PLZ (Schweiz wäre auch 4-stellig, lassen wir erstmal außen vor)
  if (/^\d{5}$/.test(z)) return "Deutschland";
  if (/^\d{4}$/.test(z)) return "Österreich";
  const c = String(city ?? "").trim().toLowerCase();
  if (!c) return null;
  const atCities = ["wien","graz","linz","salzburg","innsbruck","klagenfurt","bregenz","st. pölten","sankt pölten","eisenstadt","villach","wels"];
  if (atCities.some((x) => c.includes(x))) return "Österreich";
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = BodySchema.parse(await req.json());

    // Upsert dealers by stable identity_key so re-import doesn't recreate deleted duplicates.
    const dealersToUpsert = body.items.map((it) => {
      const name = it.dealer.name.trim();
      const street = it.dealer.street?.trim() ?? null;
      const city = it.dealer.city?.trim() ?? null;
      const inferred = inferCountryAndZip(it.dealer.zip, city, it.dealer.country?.trim() ?? null);
      const zip = inferred.zip;
      const country = inferred.country;

      return {
        identity_key: identityKey(name, street, zip, city),
        name,
        street,
        zip,
        city,
        country,
        phone: it.dealer.phone?.trim() ?? null,
        email: it.dealer.email?.trim() ?? null,
        website: it.dealer.website?.trim() ?? null,
        opening_hours: it.dealer.opening_hours?.trim() ?? null,
        norm_name: normText(name),
        // store soft-normalized street in norm_street to improve duplicate grouping
        norm_street: normStreetSoft(street),
        norm_city: normText(city ?? ""),
      };
    });

    const { data: upserted, error: upsertErr } = await supabase
      .from("dealers")
      .upsert(dealersToUpsert, { onConflict: "identity_key" })
      .select("id,identity_key");

    if (upsertErr) return bad(upsertErr.message, 500);

    const keyToId = new Map<string, string>();
    for (const d of upserted ?? []) keyToId.set(String(d.identity_key), String(d.id));

    // Manufacturer links + sources
    const links: any[] = [];
    const sources: any[] = [];

    for (const it of body.items) {
      const name = it.dealer.name.trim();
      const street = it.dealer.street?.trim() ?? null;
      const city = it.dealer.city?.trim() ?? null;
      const inferred = inferCountryAndZip(it.dealer.zip, city, it.dealer.country?.trim() ?? null);
      const zip = inferred.zip;
      const ikey = identityKey(name, street, zip, city);
      const dealer_id = keyToId.get(ikey);
      if (!dealer_id) continue;

      for (const s of it.sources) {
        const skey = String(s.source);
        links.push({ dealer_id, manufacturer_key: skey });
        sources.push({
          dealer_id,
          source: skey,
          external_id: s.external_id ?? null,
          source_url: s.source_url ?? null,
        });
      }
    }

    if (links.length) {
      const { error: lerr } = await supabase
        .from("dealer_manufacturers")
        .upsert(links, { onConflict: "dealer_id,manufacturer_key" });
      if (lerr) return bad(lerr.message, 500);
    }

    if (sources.length) {
      const { error: serr } = await supabase
        .from("dealer_sources")
        .upsert(sources, { onConflict: "dealer_id,source,external_id" });
      if (serr) return bad(serr.message, 500);
    }

    return ok({ dealers: upserted?.length ?? 0, links: links.length });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
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
      if (country === "Deutschland") zip = zip.padStart(5, "0"); // leading 0 for DE PLZ
    }
  }

  // Pad zip correctly once country is known
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


