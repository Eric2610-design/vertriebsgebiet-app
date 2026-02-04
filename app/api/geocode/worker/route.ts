import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
    new URLSearchParams({ q, format: "json", limit: "1", addressdetails: "0" });

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

/**
 * POST /api/geocode/worker
 * body: { batchId: string, limit?: number, delayMs?: number }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchId = body?.batchId;

    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId missing" }, { status: 400 });
    }

    const limit = Math.min(Number(body?.limit ?? 80), 120);
    const delayMs = Math.max(Number(body?.delayMs ?? 1100), 900);

    const sb = supabaseServer();

    const { data: dealers, error } = await sb
      .from("dealers")
      .select("id,name,street,zipcode,postal_code,city,country,geocode_status")
      .eq("geocode_batch_id", batchId)
      .eq("geocode_status", "queued")
      .order("id", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!dealers || dealers.length === 0) {
      return NextResponse.json({ ok: true, done: true, processed: 0 });
    }

    let processed = 0;
    let success = 0;
    let notFound = 0;
    let failed = 0;

    for (const d of dealers as any[]) {
      processed += 1;
      const query = buildQuery(d);

      try {
        await sleep(delayMs);
        const result = await geocodeNominatim(query);

        if (!result) {
          notFound += 1;
          await sb
            .from("dealers")
            .update({ geocode_status: "not_found", geocode_error: null, geocoded_at: new Date().toISOString() })
            .eq("id", d.id);
          continue;
        }

        success += 1;
        await sb
          .from("dealers")
          .update({
            lat: result.lat,
            lng: result.lng,
            geocode_status: "ok",
            geocode_error: null,
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", d.id);
      } catch (e: any) {
        failed += 1;
        await sb
          .from("dealers")
          .update({ geocode_status: "error", geocode_error: String(e?.message ?? e), geocoded_at: new Date().toISOString() })
          .eq("id", d.id);
      }
    }

    return NextResponse.json({ ok: true, processed, success, notFound, failed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
