import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const UpdateSchema = z.object({
  model: z.string().trim().min(1).optional(),
  serial: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
  status: z.enum(["available","in_use","service","lost"]).optional(),
  location_type: z.enum(["dealer","warehouse"]).optional(),
  dealer_id: z.string().uuid().optional().nullable(),
  warehouse_name: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
  notes: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ email: string; id: string }> }) {
  const { email, id } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  try {
    const body = UpdateSchema.parse(await req.json());
    const supabase = supabaseService();

    const patch: any = {};
    for (const k of ["model","serial","status","location_type","dealer_id","warehouse_name","notes"] as const) {
      if (typeof (body as any)[k] !== "undefined") patch[k] = (body as any)[k];
    }
    // normalize location fields
    if (patch.location_type === "dealer") {
      patch.warehouse_name = null;
      if (typeof patch.dealer_id === "undefined") patch.dealer_id = null;
    }
    if (patch.location_type === "warehouse") {
      patch.dealer_id = null;
      if (typeof patch.warehouse_name === "undefined") patch.warehouse_name = null;
    }

    const { data, error } = await supabase
      .from("demo_bikes")
      .update(patch)
      .eq("id", id)
      .eq("rep_email", repEmail)
      .select("id,rep_email,model,serial,status,location_type,dealer_id,warehouse_name,notes,created_at,updated_at")
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
    .from("demo_bikes")
    .delete()
    .eq("id", id)
    .eq("rep_email", repEmail);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
