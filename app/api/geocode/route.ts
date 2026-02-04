import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // wichtig: serverseitig

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function buildQuery(d: { name: string; street: string | null; postal_code: string | null; city: string | null }) {
  // möglichst stabil: Straße + PLZ + Stadt + DE
  const parts = [
    d.street,
    [d.postal_code, d.city].filter(Boolean).join(" "),
    "Deutschland",
  ].filter(Boolean);

  // Wenn Straße fehlt: Name + PLZ/Stadt
  const fallback = [
    d.name,
    [d.postal_code, d.city].filter(Boolean).join(" "),
    "Deutschland",
  ].filter(Boolean);

  return (parts.length >= 2 ? parts : fallback).join(", ");
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
      // Nominatim verlangt identifizierbaren User-Agent; bitte im Zweifel anpassen
      "User-Agent": "vertriebsgebiet-app (contact: erich.fuhrmann@gmail.com)",
      "Accept-Language": "de",
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = (await res.json()) as any[];
  if (!data?.length) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

/**
 * POST /api/geocode
 * Body optional:
 *  { "limit": 50, "onlyMissing": true }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit ?? 50), 200);
  const onlyMissing = body?.onlyMissing !== false; // default true

  // Kandidaten holen
  let query = supabase
    .from("dealers")
    .select("id,name,street,postal_code,city,lat,lng")
    .order("id", { ascending: true })
    .limit(limit);

  if (onlyMissing) {
    query = query.is("lat", null).is("lng", null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const dealers = data ?? [];
  let success = 0;
  let failed = 0;

  for (const d of dealers as any[]) {
    const q = buildQuery(d);

    try {
      // Rate-Limit freundlich: 1 Request/Sekunde
      await sleep(1100);

      const result = await geocodeNominatim(q);

      if (!result) {
        failed += 1;
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
    } catch (e: any) {
      failed += 1;
      await supabase
        .from("dealers")
        .update({
          geocode_status: `error`,
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
    failed,
    note: "Wenn du viele Händler hast: mehrfach ausführen (z.B. limit=100).",
  });
}
