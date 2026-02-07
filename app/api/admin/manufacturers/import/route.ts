import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

type Payload = { items?: Array<{ key: string; label: string }> };

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as Payload;
    const items = (body?.items ?? [])
      .map((x) => ({ key: String(x.key || "").trim(), label: String(x.label || "").trim() }))
      .filter((x) => x.key && x.label);

    if (!items.length) return bad("Keine Items", 400);

    const supabase = supabaseService();

    // Read existing keys
    const keys = items.map((x) => x.key);
    const existingRes = await supabase.from("manufacturers").select("key").in("key", keys);
    if (existingRes.error) return bad(existingRes.error.message, 500);
    const existing = new Set((existingRes.data ?? []).map((x: any) => x.key));

    const upsert = items.map((x) => ({
      key: x.key,
      label: x.label,
      // ensure it's visible and marked for icon upload if none yet
      icon_missing: true,
    }));

    const upsertRes = await supabase
      .from("manufacturers")
      .upsert(upsert, { onConflict: "key" })
      .select("key");
    if (upsertRes.error) return bad(upsertRes.error.message, 500);

    let inserted = 0;
    let updated = 0;
    for (const x of items) {
      if (existing.has(x.key)) updated += 1;
      else inserted += 1;
    }

    return ok({ inserted, updated, total: items.length });
  } catch (e: any) {
    return bad(
      e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler",
      e?.status || 403
    );
  }
}
