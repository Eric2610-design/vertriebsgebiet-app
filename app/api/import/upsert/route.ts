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


function digitsOnly(s: string) {
  return (s ?? "").replace(/\D+/g, "");
}

function inferCountryAndZip(zip: string | null, city: string | null, provided: string | null) {
  const pRaw = String(provided ?? "").trim();
  if (pRaw) {
    // if provided, still clean zip based on country
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

  // City hints for AT (keep list reasonably broad)
  const atCities = new Set([
    "wien","graz","linz","salzburg","innsbruck","klagenfurt","villach","wels","st. pölten","st. poelten",
    "dornbirn","feldkirch","bregenz","steyr","leoben","kapfenberg","baden","krems","amstetten",
    "wiener neustadt","wr. neustadt","wienerneustadt","traun","lustenau","schwechat"
  ]);

  // If 5 digits => DE (pad to 5)
  if (/^\d{5}$/.test(zd)) return { country: "Deutschland", zip: zd };
  // If 4 digits: could be AT, or DE with leading zero lost (e.g. 08145 -> 8145)
  if (/^\d{4}$/.test(zd)) {
    if (c && atCities.has(c)) return { country: "Österreich", zip: zd };
    // default to DE and pad to 5 to preserve leading zero regions
    return { country: "Deutschland", zip: zd.padStart(5, "0") };
  }

  // Fallback: if no zip, use city hints
  if (c && atCities.has(c)) return { country: "Österreich", zip: zd || (zip ?? null) };
  if (c) return { country: "Deutschland", zip: zd || (zip ?? null) };

  return { country: null, zip: zd || (zip ?? null) };
}



export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = BodySchema.parse(await req.json());

    // Upsert dealers by stable identity_key so re-import doesn't recreate deleted duplicates.
    const dealersToUpsert = body.items.map((it) => {
      const name = it.dealer.name.trim();
      const street = it.dealer.street?.trim() ?? null;
      const zipRaw = it.dealer.zip?.trim() ?? null;
      const city = it.dealer.city?.trim() ?? null;

      const inferred = inferCountryAndZip(zipRaw, city, it.dealer.country?.trim() ?? null);
      const zip = (inferred.zip ?? zipRaw) as any;
      const country = (inferred.country ?? null) as any;

      return {
        identity_key: identityKey(name, street, zip, city),
        name,
        street,
        zip,
        city,
        country,
        norm_name: normText(name),
        norm_street: normStreetSoft(street),
        norm_city: normText(city ?? ""),
        updated_at: new Date().toISOString(),
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
      const zip = it.dealer.zip?.trim() ?? null;
      const city = it.dealer.city?.trim() ?? null;
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
