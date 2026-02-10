export const dynamic = "force-dynamic";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

async function count(
  supabase: any,
  opts: {
    onlyActive?: boolean;
    onlyNotMerged?: boolean;
    noGeo?: boolean;
  }
) {
  let q = supabase.from("dealers").select("id", { count: "exact", head: true });

  if (opts.onlyNotMerged) q = q.is("merged_into", null);

  // Status-Spalte ist in älteren Schemas evtl. nicht vorhanden.
  if (opts.onlyActive) q = q.or("status.is.null,status.not.in.(merged,merged_force,excluded)");

  if (opts.noGeo) q = q.or("lat.is.null,lng.is.null");
  else q = q.not("lat", "is", null).not("lng", "is", null);

  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? null;
}

export async function GET() {
  try {
    await requireAdmin();

    const supabase = supabaseService();

    // Wir versuchen die "saubere" Variante (mit status/merged_into) und fallen zurück.
    const variants = [
      { onlyActive: true, onlyNotMerged: true },
      { onlyActive: true, onlyNotMerged: false },
      { onlyActive: false, onlyNotMerged: true },
      { onlyActive: false, onlyNotMerged: false },
    ];

    let total: number | null = null;
    let withGeo: number | null = null;
    let noGeo: number | null = null;
    let used: any = null;

    for (const v of variants) {
      try {
        // total (ohne Geofilter)
        let tq = supabase.from("dealers").select("id", { count: "exact", head: true });
        if (v.onlyNotMerged) tq = tq.is("merged_into", null);
        if (v.onlyActive) tq = tq.or("status.is.null,status.not.in.(merged,merged_force,excluded)");
        const tRes = await tq;
        if (tRes.error) throw tRes.error;
        total = tRes.count ?? null;

        // mit/ohne Geo
        withGeo = await count(supabase, { ...v, noGeo: false });
        noGeo = await count(supabase, { ...v, noGeo: true });

        used = v;
        break;
      } catch {
        // try next
      }
    }

    return ok({ total, with_geo: withGeo, without_geo: noGeo, filter: used });
  } catch (e: any) {
    const status = e?.status ?? 500;
    if (e?.message === "admin_only") return bad("admin_only", 403);
    return bad(e?.message ?? "Failed to load dealer stats", status);
  }
}
