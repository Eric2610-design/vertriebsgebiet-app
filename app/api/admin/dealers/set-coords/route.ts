import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);

    if (!id) return bad("Missing id", 400);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("Invalid lat/lng", 400);

    const supabase = supabaseService();
    const { error } = await supabase
      .from("dealers")
      .update({ lat, lng, geocode_status: "manual", last_geocoded_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    const status = e?.status === 403 ? 403 : 500;
    return bad(e?.message ?? "Failed", status);
  }
}
