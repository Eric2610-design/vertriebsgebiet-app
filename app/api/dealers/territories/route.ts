import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function parseBool(v: string | null) {
  return v === "1" || v === "true" || v === "yes";
}

function regionFromZip(zip: any) {
  const s = String(zip ?? "").trim();
  const m = s.match(/\d{2}/);
  return m ? m[0] : "??";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyMaster = parseBool(searchParams.get("onlyMaster"));
    const sourceParam = (searchParams.get("source") ?? "").trim();
    const sources = sourceParam ? sourceParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const sb = supabaseServer();

    let query = sb
      .from("dealers")
      .select("id,zipcode,postal_code,lat,lng,source,is_master,duplicate_of")
      .limit(50000);

    if (onlyMaster) {
      query = query.eq("is_master", true).is("duplicate_of", null);
    }

    if (sources.length === 1) {
      query = query.eq("source", sources[0]);
    } else if (sources.length > 1) {
      query = query.in("source", sources);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    const rows = data ?? [];

    const regionMap = new Map<string, { count: number; withGeo: number; missingGeo: number }>();
    const sourceSet = new Set<string>();

    for (const r of rows as any[]) {
      const zip = r.zipcode ?? r.postal_code ?? null;
      const region = regionFromZip(zip);
      const hasGeo = r.lat != null && r.lng != null;

      const cur = regionMap.get(region) ?? { count: 0, withGeo: 0, missingGeo: 0 };
      cur.count += 1;
      if (hasGeo) cur.withGeo += 1;
      else cur.missingGeo += 1;
      regionMap.set(region, cur);

      const s = (r.source ?? "").toString().trim();
      if (s) sourceSet.add(s);
    }

    const out = Array.from(regionMap.entries())
      .map(([region, v]) => ({ region, ...v }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ ok: true, rows: out, total: rows.length, sources: Array.from(sourceSet).sort() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
