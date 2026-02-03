import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

const QuerySchema = z.object({
  workspaceId: z.string().uuid(),
  sources: z.string().optional(), // comma-separated codes
  territory: z.string().optional(), // "1" | "0"
});

function territoryOk(zipcode: string | null): boolean {
  if (!zipcode) return false;
  const p2 = zipcode.slice(0, 2);
  const n = parseInt(p2, 10);
  if (Number.isNaN(n)) return false;
  return (n >= 35 && n <= 36) || (n >= 53 && n <= 57) || (n >= 60 && n <= 69);
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    const sourcesRaw = url.searchParams.get("sources") ?? "";
    const territory = (url.searchParams.get("territory") ?? "1") !== "0";

    const parsed = QuerySchema.parse({ workspaceId, sources: sourcesRaw || undefined, territory: territory ? "1" : "0" });
    const selectedSources = (parsed.sources ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const admin = createSupabaseAdmin();
    const db = admin.schema("app");

    // Zugriff prüfen
    const { data: mem } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", parsed.workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    // Primary Locations
    const { data: locs, error: locErr } = await db
      .from("dealer_locations")
      .select("id, dealer_id, street, zipcode, city, country, phone, email, website, lat, lng, is_primary")
      .eq("workspace_id", parsed.workspaceId)
      .eq("is_primary", true);

    if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

    const dealerIds = uniq((locs ?? []).map((l: any) => l.dealer_id).filter(Boolean));
    if (!dealerIds.length) {
      return NextResponse.json({ locations: [], stats: { total: 0, shown: 0, missingGeo: 0 } });
    }

    const { data: dealers, error: dErr } = await db
      .from("dealers")
      .select("id, canonical_name")
      .eq("workspace_id", parsed.workspaceId)
      .in("id", dealerIds);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    const dealerName = new Map<string, string>();
    for (const d of dealers ?? []) dealerName.set((d as any).id, (d as any).canonical_name ?? "Unbekannt");

    // Quellen pro Dealer ermitteln (über source_links → source_records → import_runs → source_types)
    const { data: links, error: lErr } = await db
      .from("source_links")
      .select("dealer_id, source_record_id")
      .in("dealer_id", dealerIds);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    const recordIds = uniq((links ?? []).map((x: any) => x.source_record_id).filter(Boolean));
    const dealerToRecordIds = new Map<string, string[]>();
    for (const x of links ?? []) {
      const did = (x as any).dealer_id as string;
      const rid = (x as any).source_record_id as string;
      if (!did || !rid) continue;
      const arr = dealerToRecordIds.get(did) ?? [];
      arr.push(rid);
      dealerToRecordIds.set(did, arr);
    }

    let recordToRun = new Map<string, string>();
    if (recordIds.length) {
      const { data: srs, error: srErr } = await db
        .from("source_records")
        .select("id, import_run_id")
        .in("id", recordIds);

      if (srErr) return NextResponse.json({ error: srErr.message }, { status: 500 });

      for (const sr of srs ?? []) recordToRun.set((sr as any).id, (sr as any).import_run_id);
    }

    const runIds = uniq(Array.from(recordToRun.values()).filter(Boolean));
    const runToType = new Map<string, string>();
    if (runIds.length) {
      const { data: runs, error: rErr } = await db
        .from("import_runs")
        .select("id, source_type_id")
        .in("id", runIds);

      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

      for (const r of runs ?? []) runToType.set((r as any).id, (r as any).source_type_id);
    }

    const typeIds = uniq(Array.from(runToType.values()).filter(Boolean));
    const typeIdToCode = new Map<string, string>();
    if (typeIds.length) {
      const { data: sts, error: stErr } = await db
        .from("source_types")
        .select("id, code")
        .in("id", typeIds);

      if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

      for (const s of sts ?? []) typeIdToCode.set((s as any).id, (s as any).code);
    }

    const dealerToSources = new Map<string, string[]>();
    for (const did of dealerIds) {
      const rids = dealerToRecordIds.get(did) ?? [];
      const codes = new Set<string>();
      for (const rid of rids) {
        const runId = recordToRun.get(rid);
        if (!runId) continue;
        const typeId = runToType.get(runId);
        if (!typeId) continue;
        const code = typeIdToCode.get(typeId);
        if (code) codes.add(code);
      }
      dealerToSources.set(did, Array.from(codes));
    }

    // Build response rows
    const rows = (locs ?? []).map((l: any) => {
      const did = l.dealer_id as string;
      const sources = dealerToSources.get(did) ?? [];
      const inTerritory = territoryOk(l.zipcode ?? null);
      return {
        location_id: l.id,
        dealer_id: did,
        dealer_name: dealerName.get(did) ?? "Unbekannt",
        street: l.street ?? null,
        zipcode: l.zipcode ?? null,
        city: l.city ?? null,
        country: l.country ?? "DE",
        phone: l.phone ?? null,
        email: l.email ?? null,
        website: l.website ?? null,
        lat: typeof l.lat === "number" ? l.lat : null,
        lng: typeof l.lng === "number" ? l.lng : null,
        sources,
        in_territory: inTerritory,
      };
    });

    let filtered = rows;

    if (territory) filtered = filtered.filter((r) => r.in_territory);

    if (selectedSources.length) {
      filtered = filtered.filter((r) => r.sources.some((s: string) => selectedSources.includes(s)));
    }

    const missingGeo = filtered.filter((r) => r.lat === null || r.lng === null).length;

    return NextResponse.json({
      locations: filtered,
      stats: {
        total: rows.length,
        shown: filtered.length,
        missingGeo,
      },
    });
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : (e?.message ?? "Map locations failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
