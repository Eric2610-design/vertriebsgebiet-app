import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const supabase = supabaseService();
    // Dealers without coordinates (lat or lng missing)
    let query = supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,buying_group_key,updated_at")
      .or("lat.is.null,lng.is.null")
      .order("updated_at", { ascending: false })
      .limit(5000);

    const { data, error } = await query;
    if (error) return bad(error.message, 500);

    const items = (data ?? []).filter((d: any) => {
      if (!q) return true;
      const hay = `${d.name ?? ""} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    return ok({ items });
  } catch (e: any) {
    const status = e?.status === 403 ? 403 : 500;
    return bad(e?.message ?? "Failed", status);
  }
}
