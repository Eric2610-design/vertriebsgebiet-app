import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function slimError(e: any) {
  if (!e) return null;
  return {
    message: e.message ?? String(e),
    details: e.details ?? null,
    hint: e.hint ?? null,
    code: e.code ?? null,
  };
}

async function tryListByDealerId(admin: any, table: string, dealerId: string) {
  // Wir versuchen dealer_id – wenn Tabelle/Spalte anders heißt, liefern wir [] statt 500.
  const res = await admin.from(table).select("*").eq("dealer_id", dealerId);
  if (res.error) return { data: [], error: slimError(res.error) };
  return { data: res.data ?? [], error: null };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params?.id;

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "missing_id" },
      { status: 400 }
    );
  }

  // Login prüfen (damit nicht jeder anonym alles abfragen kann)
  const supabase = createSupabaseServer();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 }
    );
  }

  // Für Reads nehmen wir Admin, damit du nicht an RLS/Schema-Problemen stirbst.
  const admin = createSupabaseAdmin();

  // Dealer laden – WICHTIG: KEIN name_norm selektieren!
  const dealerRes = await admin.from("dealers").select("*").eq("id", id).maybeSingle();

  if (dealerRes.error) {
    return NextResponse.json(
      { ok: false, error: "DB error loading dealer", extra: slimError(dealerRes.error) },
      { status: 500 }
    );
  }

  if (!dealerRes.data) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }

  // Optional: related Daten (wenn Tabellen existieren)
  const [locationsRes, linksRes] = await Promise.all([
    tryListByDealerId(admin, "locations", id),
    tryListByDealerId(admin, "links", id),
  ]);

  // Notes: falls du ein notes-table/endpoint hast, kannst du es später separat lösen.
  return NextResponse.json({
    ok: true,
    dealer: dealerRes.data,
    locations: locationsRes.data,
    links: linksRes.data,
    warnings: {
      locations: locationsRes.error,
      links: linksRes.error,
    },
  });
}
