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

function buildQuery(d: any) {
  const street = clean(d.street);
  const zip = clean(d.zipcode) ?? clean(d.postal_code);
  const city = clean(d.city);
  const country = clean(d.country) ?? "Deutschland";

  const primary = [street, [zip, city].filter(Boolean).join(" "), country].filter(Boolean);
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

async function getCounts() {
  const total = await supabase.from("dealers").select("id", { count: "exact", head: true });

  const withGeo = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .not("lat", "is", null)
    .not("lng", "is", null);

  const missingGeo = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .is("lat", null)
    .is("lng", null);

  const ok = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_status", "ok");

  const notFound = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_status", "not_found");

  const error = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_status", "error");

  return {
    total: total.count ?? 0,
    withGeo: withGeo.count ?? 0,
    missingGeo: missingGeo.count ?? 0,
    ok: ok.count ?? 0,
    notFound: notFound.count ?? 0,
    error: error.count ?? 0,
  };
}

/**
 * POST /api/geocode
 * body:
 *  {
 *    batchSize?: number (default 200, max 200)
 *    onlyMissing?: boolean (default true)
 *    retryNotFound?: boolean (default false)
 *    delayMs?: number (default 1100) // rate-limit Nominatim
 *  }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const batchSize = Math.min(Number(body?.batchSize ?? 200), 200);
  const onlyMissing = body?.onlyMissing !== false;
  const retryNotFound = body?.retryNotFound === true;
  const delayMs = Math.max(Number(body?.delayMs ?? 1100), 900);

  let q = supabase
    .from("dealers")
    .select("id,name,street,zipcode,postal_code,city,country,lat,lng,geocode_status")
    .order("id", { ascending: true })
    .limit(batchSize);

  if (onlyMissing) q = q.is("lat", null).is("lng", null);
  if (!retryNotFound) q = q.not("geocode_status", "eq", "not_found");

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const dealers = data ?? [];
  let success = 0;
  let notFound = 0;
  let failed = 0;

  for (const d of dealers as any[]) {
    const query = buildQuery(d);

    try {
      await sleep(delayMs);
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
    } catch {
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

  const counts = await getCounts();

  return NextResponse.json({
    ok: true,
    processed: dealers.length,
    success,
    notFound,
    failed,
    counts,
  });
}
