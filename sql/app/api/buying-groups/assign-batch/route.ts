import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const dealer_ids_raw = Array.isArray(body?.dealer_ids) ? body.dealer_ids : [];
    const dealer_ids = Array.from(
      new Set(dealer_ids_raw.map((x: any) => String(x || "").trim()).filter(Boolean))
    );

    const buying_group_key_raw = body?.buying_group_key;
    const buying_group_key =
      buying_group_key_raw == null || buying_group_key_raw === ""
        ? null
        : String(buying_group_key_raw).trim().toLowerCase();

    if (!dealer_ids.length) return bad("dealer_ids fehlt", 400);

    const supabase = supabaseService();
    const { error } = await supabase.from("dealers").update({ buying_group_key }).in("id", dealer_ids);
    if (error) return bad(error.message, 500);

    return ok({ ok: true, count: dealer_ids.length });
  } catch (e: any) {
    return bad(e?.message || "Nicht erlaubt", e?.status || 403);
  }
}
