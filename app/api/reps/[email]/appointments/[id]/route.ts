import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const UpdateSchema = z.object({
  dealer_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional().nullable(),
  with_whom: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
  notes: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
  status: z.enum(["open","done","canceled"]).optional(),
  report: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ email: string; id: string }> }) {
  const { email, id } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  try {
    const body = UpdateSchema.parse(await req.json());
    const supabase = supabaseService();
    const patch: any = {};
    for (const k of ["dealer_id","title","starts_at","ends_at","with_whom","notes","status","report"] as const) {
      if (typeof (body as any)[k] !== "undefined") patch[k] = (body as any)[k];
    }
    if (patch.starts_at) patch.starts_at = new Date(patch.starts_at).toISOString();
    if (typeof patch.ends_at !== "undefined") patch.ends_at = patch.ends_at ? new Date(patch.ends_at).toISOString() : null;

    // if marking done, set done_at if report exists; otherwise allow manual done as well
    if (patch.status === "done") {
      patch.done_at = new Date().toISOString();
    }
    if (patch.status === "open") {
      patch.done_at = null;
    }

    const { data, error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", id)
      .eq("rep_email", repEmail)
      .select("id,rep_email,dealer_id,title,starts_at,ends_at,with_whom,notes,status,report,done_at,created_at,updated_at")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ email: string; id: string }> }) {
  const { email, id } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  const supabase = supabaseService();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("rep_email", repEmail);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
