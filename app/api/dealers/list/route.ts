export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const url = new URL(req.url);

    const limit = clampInt(url.searchParams.get("limit"), 5000, 1, 10000);
    const offset = clampInt(url.searchParams.get("offset"), 0, 0, 200000);

    const from = offset;
    const to = offset + limit - 1;

    const { data: dealers, error: dealersError, count } = await supabase
      .from("dealers")
      .select(
        "id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,buying_group_key,updated_at",
        { count: "exact" }
      )
      .eq("status", "active")
      .is("merged_into", null)
      .order("name", { ascending: true })
      .range(from, to);

    if (dealersError) {
      return NextResponse.json(
        { error: "Dealer query failed", supabase_error: dealersError },
        { status: 400 }
      );
    }

    const ids = (dealers ?? []).map((d: any) => d.id).filter(Boolean);

    // Hersteller pro Dealer holen (in Chunks, damit "IN (...)" nicht zu groß wird)
    const manufacturersByDealer = new Map<string, string[]>();
    for (const part of chunk(ids, 900)) {
      const { data: mans, error: mansError } = await supabase
        .from("dealer_manufacturers")
        .select("dealer_id,manufacturer_key,status")
        .in("dealer_id", part)
        .eq("status", "active");

      if (mansError) {
        return NextResponse.json(
          { error: "Manufacturer query failed", supabase_error: mansError },
          { status: 400 }
        );
      }

      for (const m of mans ?? []) {
        const did = (m as any).dealer_id as string;
        const key = (m as any).manufacturer_key as string;
        if (!did || !key) continue;
        const arr = manufacturersByDealer.get(did) ?? [];
        if (!arr.includes(key)) arr.push(key);
        manufacturersByDealer.set(did, arr);
      }
    }

    const items = (dealers ?? []).map((d: any) => ({
      ...d,
      manufacturer_keys: manufacturersByDealer.get(d.id) ?? [],
    }));

    return NextResponse.json({
      items,
      total: count ?? items.length,
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
