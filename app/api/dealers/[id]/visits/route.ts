import { z } from "zod";
import { ok, bad } from "@/app/api/_util";
import { requireUser } from "@/app/api/_auth";

const BodySchema = z.object({ note: z.string().min(1).max(4000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const body = BodySchema.parse(await req.json());
    const { supabase } = await requireUser();

    // Wenn Dealer per RLS nicht sichtbar ist, blocken wir.
    const { data: dealer } = await supabase.from("dealers").select("id").eq("id", params.id).maybeSingle();
    if (!dealer) return bad("forbidden", 403);

    const { error } = await supabase.from("visits").insert({ dealer_id: params.id, note: body.note.trim() } as any);
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
