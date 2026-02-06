import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "");
    const key = String(body?.key || "").trim().toLowerCase();
    const icon_data_url = String(body?.icon_data_url || "").trim();

    if (!key || !icon_data_url) return bad("key und icon_data_url erforderlich", 400);

    const supabase = supabaseService();

    if (kind === "manufacturer") {
      const r = await supabase
        .from("manufacturers")
        .update({ icon_data_url, icon_missing: false })
        .eq("key", key);

      if (r.error) return bad(r.error.message, 500);
      return ok({ ok: true });
    }

    if (kind === "buying_group") {
      const r = await supabase
        .from("buying_groups")
        .update({ icon_data_url, icon_missing: false })
        .eq("key", key);

      if (r.error) return bad(r.error.message, 500);
      return ok({ ok: true });
    }

    return bad("kind muss manufacturer oder buying_group sein", 400);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const msg = e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler";
    return bad(msg, status);
  }
}
