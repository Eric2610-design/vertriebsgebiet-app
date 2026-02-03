import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const dealerId = ctx.params.id;

  // 1) User-Session prüfen
  const supa = createSupabaseServer();
  const {
    data: { user },
    error: userErr,
  } = await supa.auth.getUser();

  if (userErr || !user) return jsonError(401, "Not authenticated");

  // 2) Admin-Client fürs DB-Lesen (wir prüfen Berechtigung selbst)
  const admin = createSupabaseAdmin();

  // Dealer laden
  const { data: dealer, error: dealerErr } = await admin
    .from("dealers")
    .select("id, workspace_id, canonical_name, name_norm, created_at, created_by")
    .eq("id", dealerId)
    .maybeSingle();

  if (dealerErr) return jsonError(500, "DB error loading dealer", dealerErr);
  if (!dealer) return jsonError(404, "Dealer not found");

  // Workspace-Mitgliedschaft prüfen
  const { data: member, error: memErr } = await admin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", dealer.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr) return jsonError(500, "DB error checking membership", memErr);
  if (!member) return jsonError(403, "No access to this workspace");

  // Locations laden
  const { data: locations, error: locErr } = await admin
    .from("dealer_locations")
    .select(
      "id, dealer_id, workspace_id, name, name_norm, street, zipcode, city, country, phone, email, website, is_primary, source_record_id, created_at"
    )
    .eq("dealer_id", dealerId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (locErr) return jsonError(500, "DB error loading locations", locErr);

  // Links laden (Zuordnung Dealer <-> SourceRecord)
  const { data: links, error: linkErr } = await admin
    .from("source_links")
    .select("id, dealer_id, workspace_id, source_record_id, link_type, strength, meta, created_at")
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false });

  if (linkErr) return jsonError(500, "DB error loading source links", linkErr);

  // Source Records laden
  const sourceRecordIds = Array.from(
    new Set((links ?? []).map((l: any) => l.source_record_id).filter(Boolean))
  );

  let sourceRecords: any[] = [];
  if (sourceRecordIds.length) {
    const { data: sr, error: srErr } = await admin
      .from("source_records")
      .select("id, source_type_id, name, street, zipcode, city, country, phone, email, website, external_ids, created_at")
      .in("id", sourceRecordIds);

    if (srErr) return jsonError(500, "DB error loading source records", srErr);
    sourceRecords = sr ?? [];
  }

  // Source Types laden (für Anzeigenamen wie "BICO Händlerliste BC")
  const typeIds = Array.from(
    new Set(sourceRecords.map((r: any) => r.source_type_id).filter(Boolean))
  );

  let sourceTypes: any[] = [];
  if (typeIds.length) {
    const { data: st, error: stErr } = await admin
      .from("source_types")
      .select("id, name")
      .in("id", typeIds);

    if (stErr) return jsonError(500, "DB error loading source types", stErr);
    sourceTypes = st ?? [];
  }

  const typeById = new Map(sourceTypes.map((t: any) => [t.id, t.name]));

  const sources = sourceRecords.map((r: any) => ({
    ...r,
    source_type_name: typeById.get(r.source_type_id) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    dealer,
    locations: locations ?? [],
    links: links ?? [],
    sources,
  });
}
