import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";
import { requireRole } from "@/app/api/_auth";

const BodySchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
});

function slugKey(label: string) {
  const s = normText(label).replace(/\s+/g, "_");
  return s || `m_${Date.now()}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const body = BodySchema.parse(await req.json());
    await requireRole(["admin", "superadmin"]);
    const supabase = supabaseService();

    let key = body.key.trim().toLowerCase();
    const label = body.label?.trim();
    if (key === "__new__" && label) key = slugKey(label);

    if (label) {
      // Ensure manufacturer exists
      const { error: merr } = await supabase
        .from("manufacturers")
        .upsert({ key, label }, { onConflict: "key" });
      if (merr) return bad(merr.message, 500);
    }

    const { error } = await supabase
      .from("dealer_manufacturers")
      .upsert({ dealer_id: params.id, manufacturer_key: key }, { onConflict: "dealer_id,manufacturer_key" });
    if (error) return bad(error.message, 500);

    return ok({ ok: true, key });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
