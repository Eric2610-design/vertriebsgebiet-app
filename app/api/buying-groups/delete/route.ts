import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const key = String(body?.key || "").trim().toLowerCase();
    if (!key) return bad("key fehlt", 400);

    const supabase = supabaseService();

    // unassign dealers first
    const u = await supabase.from("dealers").update({ buying_group_key: null }).eq("buying_group_key", key);
    if (u.error) return bad(u.error.message, 500);

    const d = await supabase.from("buying_groups").delete().eq("key", key);
    if (d.error) return bad(d.error.message, 500);

    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler", e?.status || 403);
  }
}
