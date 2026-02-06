import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const key = String(body?.key || "").trim().toLowerCase();
    const label = String(body?.label || "").trim();

    if (!key || !label) return bad("key und label erforderlich", 400);

    const supabase = supabaseService();
    const { error } = await supabase
      .from("buying_groups")
      .upsert({ key, label, icon_missing: true });

    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 403;
    const msg = e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler";
    return bad(msg, status);
  }
}
