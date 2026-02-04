import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

async function geocode(q: string) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({ q, format: "json", limit: "1" });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "vertriebsgebiet-app (contact: erich.fuhrmann@gmail.com)",
      "Accept-Language": "de",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  if (!json?.length) return null;

  return {
    lat: Number(json[0].lat),
    lng: Number(json[0].lon),
  };
}

export async function POST(req: Request) {
  const { batchId } = await req.json();

  if (!batchId) {
    return NextResponse.json({ ok: false, error: "batchId missing" }, { status: 400 });
  }

  // immer nur 100 auf einmal
  const { data: dealers } = await supabase
    .from("dealers")
    .select("id,name,street,zipcode,postal_code,city,country")
    .eq("geocode_batch_id", batchId)
    .eq("geocode_status", "queued")
    .limit(100);

  if (!dealers || dealers.length === 0) {
    return NextResponse.json({ ok: true, done: true });
  }

  for (const d of dealers) {
    try {
      await sleep(1100);
      const q = buildQuery(d);
      const res = await geocode(q);

      if (!res) {
        await supabase
          .from("dealers")
          .update({ geocode_status: "not_found" })
          .eq("id", d.id);
        continue;
      }

      await supabase
        .from("dealers")
        .update({
          lat: res.lat,
          lng: res.lng,
          geocode_status: "ok",
        })
        .eq("id", d.id);
    } catch (e: any) {
      await supabase
        .from("dealers")
        .update({
          geocode_status: "error",
          geocode_error: String(e?.message ?? e),
        })
        .eq("id", d.id);
    }
  }

  return NextResponse.json({ ok: true, processed: dealers.length });
}
