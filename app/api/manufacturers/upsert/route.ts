import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

const BodySchema = z.object({
  key: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
});

function slugKey(label: string) {
  // Create a stable key like "riese_mueller".
  const s = normText(label).replace(/\s+/g, "_");
  return s || `m_${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const supabase = supabaseService();
    const key = (body.key?.trim() || slugKey(body.label)).toLowerCase();
    const label = body.label.trim();

    const existing = await supabase.from("manufacturers").select("key").eq("key", key).maybeSingle();
    if (existing.error) return bad(existing.error.message, 500);

    if (!existing.data) {
      const ins = await supabase
        .from("manufacturers")
        .insert({ key, label, icon_missing: true })
        .select("key,label,icon_missing")
        .maybeSingle();
      if (ins.error) return bad(ins.error.message, 500);
      return ok({ item: ins.data });
    }

    const upd = await supabase
      .from("manufacturers")
      .update({ label })
      .eq("key", key)
      .select("key,label")
      .maybeSingle();
    if (upd.error) return bad(upd.error.message, 500);

    return ok({ item: upd.data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
