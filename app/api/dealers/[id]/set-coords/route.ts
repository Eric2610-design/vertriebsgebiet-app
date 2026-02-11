export const dynamic = "force-dynamic";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getVtRole } from "@/app/api/_admin";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = String(await getVtRole()).toLowerCase();
  if (role !== "admin" && role !== "superadmin" && role !== "aussendienst") {
    return bad("Forbidden", 403);
  }

  const params = await ctx.params;
  const dealerId = params.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const lat = Number(String(body?.lat ?? "").replace(",", "."));
  const lng = Number(String(body?.lng ?? "").replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return bad("Invalid lat/lng", 400);
  }

  const supabase = supabaseService();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("dealers")
    .update({ lat, lng, geocode_status: "manual", last_geocoded_at: now })
    .eq("id", dealerId);
  if (error) return bad(error.message, 500);

  // keep the override layer in sync (so views using overrides still work)
  await supabase.from("dealer_field_overrides").upsert(
    [
      { dealer_id: dealerId, field_name: "lat", value_json: lat, updated_at: now },
      { dealer_id: dealerId, field_name: "lng", value_json: lng, updated_at: now },
    ],
    { onConflict: "dealer_id,field_name" }
  );

  return ok({ ok: true });
}
