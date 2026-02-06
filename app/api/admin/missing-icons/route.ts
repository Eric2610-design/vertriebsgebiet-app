import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function GET(req: Request) {
  try {
    requireAdmin(req);

    const supabase = supabaseService();
    const [mRes, bRes] = await Promise.all([
      supabase
        .from("manufacturers")
        .select("key,label,icon_data_url,icon_missing")
        .order("label"),
      supabase
        .from("buying_groups")
        .select("key,label,icon_data_url,icon_missing")
        .order("label"),
    ]);

    if (mRes.error) return bad(mRes.error.message, 500);
    if (bRes.error) return bad(bRes.error.message, 500);

    const missing_manufacturers = (mRes.data ?? []).filter(
      (x: any) => x.icon_missing || !x.icon_data_url
    );
    const missing_buying_groups = (bRes.data ?? []).filter(
      (x: any) => x.icon_missing || !x.icon_data_url
    );

    return ok({ missing_manufacturers, missing_buying_groups });
  } catch (e: any) {
    return bad(
      e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler",
      e?.status || 403
    );
  }
}
