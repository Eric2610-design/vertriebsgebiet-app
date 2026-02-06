import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const dealer_id = String(body?.dealer_id || "").trim();

    const buying_group_key_raw = body?.buying_group_key;
    const buying_group_key =
      buying_group_key_raw == null || buying_group_key_raw === ""
        ? null
        : String(buying_group_key_raw).trim().toLowerCase();

    if (!dealer_id) return bad("dealer_id fehlt", 400);

    const supabase = supabaseService();
    const { error } = await supabase
      .from("dealers")
      .update({ buying_group_key })
      .eq("id", dealer_id);

    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 403;
    const msg = e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler";
    return bad(msg, status);
  }
}
