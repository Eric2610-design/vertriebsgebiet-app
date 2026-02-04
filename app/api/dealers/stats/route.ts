import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { dealerKey } from "@/lib/dealerUtils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = supabaseServer();

    const total = await sb.from("dealers").select("id", { count: "exact", head: true });
    if (total.error) return NextResponse.json({ ok: false, error: total.error.message }, { status: 400 });

    const masters = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("is_master", true)
      .is("duplicate_of", null);
    if (masters.error) return NextResponse.json({ ok: false, error: masters.error.message }, { status: 400 });

    const withGeo = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .not("lat", "is", null)
      .not("lng", "is", null);
    if (withGeo.error) return NextResponse.json({ ok: false, error: withGeo.error.message }, { status: 400 });

    const geocodeOk = await sb.from("dealers").select("id", { count: "exact", head: true }).eq("geocode_status", "ok");
    const geocodeNotFound = await sb.from("dealers").select("id", { count: "exact", head: true }).eq("geocode_status", "not_found");
    const geocodeError = await sb.from("dealers").select("id", { count: "exact", head: true }).eq("geocode_status", "error");

    // Best-effort: compute unique/duplicates by key on a sample (up to 20k)
    const { data: sample, error: sampleErr } = await sb
      .from("dealers")
      .select("id,name,zipcode,postal_code,city")
      .limit(20000);

    if (sampleErr) {
      return NextResponse.json({
        ok: true,
        counts: {
          total: total.count ?? 0,
          masters: masters.count ?? 0,
          approxUniqueByKey: 0,
          duplicatesByKey: 0,
          withGeo: withGeo.count ?? 0,
          missingGeo: Math.max((total.count ?? 0) - (withGeo.count ?? 0), 0),
          geocodeOk: geocodeOk.count ?? 0,
          geocodeNotFound: geocodeNotFound.count ?? 0,
          geocodeError: geocodeError.count ?? 0,
        },
        sources: [],
        note: "sample query failed; stats are partial",
      });
    }

    const keyCount = new Map<string, number>();
    const sourceSet = new Set<string>();

    // Also build sources with a separate query (limited)
    const { data: srcRows } = await sb.from("dealers").select("source").limit(20000);
    (srcRows ?? []).forEach((r: any) => {
      const s = (r?.source ?? "").toString().trim();
      if (s) sourceSet.add(s);
    });

    for (const r of sample ?? []) {
      const zipcode = (r as any).zipcode ?? (r as any).postal_code ?? null;
      const k = dealerKey({ name: (r as any).name, zipcode, city: (r as any).city });
      if (!k || k.startsWith("||")) continue;
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }

    let approxUniqueByKey = 0;
    let duplicatesByKey = 0;
    for (const [, c] of keyCount.entries()) {
      approxUniqueByKey += 1;
      if (c > 1) duplicatesByKey += 1;
    }

    const totalCount = total.count ?? 0;
    const withGeoCount = withGeo.count ?? 0;

    return NextResponse.json({
      ok: true,
      counts: {
        total: totalCount,
        masters: masters.count ?? 0,
        approxUniqueByKey,
        duplicatesByKey,
        withGeo: withGeoCount,
        missingGeo: Math.max(totalCount - withGeoCount, 0),
        geocodeOk: geocodeOk.count ?? 0,
        geocodeNotFound: geocodeNotFound.count ?? 0,
        geocodeError: geocodeError.count ?? 0,
      },
      sources: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
