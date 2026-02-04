import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function norm(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function keyOf(d: any) {
  // Schätz-Key (hilft schon gut, bevor du manuell gemerged hast)
  return `${norm(d.name)}|${norm(d.zipcode)}|${norm(d.city)}`;
}

export async function GET() {
  // 1) harte Zähler (Server zählt)
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

  const err = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_status", "error");

  // 2) "tatsächlich Händler" = Masters, wenn du schon merged benutzt
  const masters = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("is_master", true);

  // 3) Schätzung "unique" über Norm-Key (Name+PLZ+Ort)
  // Achtung: Für sehr große Tabellen nehmen wir ein Limit, damit es schnell bleibt.
  // Für dich reicht das als Orientierung.
  const { data: sample, error } = await supabase
    .from("dealers")
    .select("id,name,zipcode,city,source,is_master")
    .limit(20000);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        counts: {
          total: total.count ?? 0,
          withGeo: withGeo.count ?? 0,
          missingGeo: missingGeo.count ?? 0,
          ok: ok.count ?? 0,
          notFound: notFound.count ?? 0,
          error: err.count ?? 0,
          masters: masters.count ?? 0,
        },
      },
      { status: 400 }
    );
  }

  const seen = new Set<string>();
  const perSource: Record<string, number> = {};
  for (const d of sample ?? []) {
    const k = keyOf(d);
    if (k.replace(/\|/g, "").length === 0) continue;
    seen.add(k);

    const s = String((d as any).source ?? "unknown");
    perSource[s] = (perSource[s] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    counts: {
      total: total.count ?? 0,
      withGeo: withGeo.count ?? 0,
      missingGeo: missingGeo.count ?? 0,
      ok: ok.count ?? 0,
      notFound: notFound.count ?? 0,
      error: err.count ?? 0,
      masters: masters.count ?? 0,
      approxUniqueByKey: seen.size, // Schätzung
      sampleSize: (sample ?? []).length,
    },
    perSource,
  });
}
