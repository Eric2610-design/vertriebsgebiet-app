import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getUserContext, isAdminRole, inRanges } from "@/app/api/_userctx";

const BodySchema = z.object({ note: z.string().min(1).max(4000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const body = BodySchema.parse(await req.json());
    const userCtx = await getUserContext();
    const supabase = supabaseService();

    // Allow visits for admins and reps within their territory
    if (!isAdminRole(userCtx.role)) {
      const { data: dealer } = await supabase
        .from("dealers")
        .select("id,country,zipcode_int")
        .eq("id", params.id)
        .maybeSingle();
      if (userCtx.role !== "aussendienst" || !inRanges(dealer?.country, dealer?.zipcode_int ?? null, userCtx.ranges)) {
        return bad("forbidden", 403);
      }
    }
    const { error } = await supabase.from("visits").insert({ dealer_id: params.id, note: body.note.trim() });
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
