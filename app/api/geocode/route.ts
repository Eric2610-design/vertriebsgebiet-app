import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function clean(v: any) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function buildQuery(d: {
  name: string;
  street: string | null;
  zipcode: string | null;
  city: string | null;
  country: string | null;
  postal_code?: string | null;
}) {
  // wir nutzen zipcode, fallen aber auf postal_code zurück, falls vorhanden
  const zip = clean(d.zipcode) ?? clean(d.postal_code) ?? null;
  const city = clean(d.city);
  const street = clean(d.street);
  const country = clean(d.country) ?? "Deutschland";

  // beste Qualität: Straße + PLZ + Ort + Land
  const primary = [street, [zip, city].filter(Boolean).join(" "), country].filter(Boolean);

  // fallback: Name + PLZ/Ort + Land
  const fallback = [clean(d.name), [zip, city].filter(Boolean).join(" "), country].filter(Boolean);

  return (primary.length >= 2 ? primary : fallback).join(", ");
}

async function geocodeNominatim(q: string) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      limit: "1",
      addressdetails: "0",
    }).toString();

  const res = await fetch(url, {
    headers: {
      // Nominatim erwartet einen identifizierbaren User-Agent
      "User-Agent": "vertriebsgebiet-app (contact: erich.fuhrmann@gmail.com)",
      "Accept-Language": "de",
    },
  });

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

  const data = (await res.json()) as any[];
  if (!data?.length) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * POST /api/geocode
 * body:
 *  {
 *    limit: number (default 50, max 200),
 *    onlyMissing: boolean (default true),
 *    retryNotFound: boolean (default false)
 *  }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const limit = Math.min(Number(body?.limit ?? 50), 200);
  const onlyMissing = body?.onlyMissing !== false;
  const retryNotFound = body?.retryNotFound === true;

  let q = supabase
    .from("dealers")
    .select("id,name,street,zipcode,postal_code,city,country,lat,lng,geocode_status")
    .order("id", { ascending: true })
    .limit(limit);

  if (onlyMissing) {
    q = q.is("lat", null).is("lng", null);
  }

  if (!retryNotFound) {
    // wenn schon not_found markiert, überspringen (außer retryNotFound=true)
    q = q.not("geocode_status", "eq", "not_found");
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const dealers = data ?? [];
  let success = 0;
  let failed = 0;
  let notFound = 0;

  for (const d of dealers as any[]) {
    const query = buildQuery(d);

    try {
      // rate-limit freundlich: ~1 req/sec
      await sleep(1100);

      const result = await geocodeNominatim(query);

      if (!result) {
        notFound += 1;
        await supabase
          .from("dealers")
          .update({
            geocode_status: "not_found",
            geocode_provider: "nominatim",
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", d.id);
        continue;
      }

      success += 1;
      await supabase
        .from("dealers")
        .update({
          lat: result.lat,
          lng: result.lng,
          geocode_status: "ok",
          geocode_provider: "nominatim",
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", d.id);
    } catch (e) {
      failed += 1;
      await supabase
        .from("dealers")
        .update({
          geocode_status: "error",
          geocode_provider: "nominatim",
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", d.id);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: dealers.length,
    success,
    notFound,
    failed,
  });
}
