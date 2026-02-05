import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const BodySchema = z.object({
  parent_id: z.string().uuid(),
  child_ids: z.array(z.string().uuid()).min(1),
  branch_label: z.string().optional().nullable(), // optional label applied to children if provided
});

export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = BodySchema.parse(await req.json());
    const child_ids = Array.from(new Set(body.child_ids)).filter((id) => id !== body.parent_id);
    if (child_ids.length === 0) return bad("Keine gültigen Child-IDs", 400);

    // Set parent on children
    const patch: any = { parent_dealer_id: body.parent_id };
    if (body.branch_label != null && body.branch_label.trim() !== "") patch.branch_label = body.branch_label.trim();

    const { error } = await supabase.from("dealers").update(patch).in("id", child_ids);
    if (error) return bad(error.message, 500);

    return ok({ ok: true, parent_id: body.parent_id, children: child_ids });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
