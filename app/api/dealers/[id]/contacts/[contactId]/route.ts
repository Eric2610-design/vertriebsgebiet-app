import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireRole } from "@/app/api/_auth";

const UpdateSchema = z.object({
  role: z.enum(["Geschaeftsfuehrer","Verkauf","Werkstatt","Buchhaltung","Sonstiges"]).optional(),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v)=>v || null).optional(),
  phone: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await ctx.params;
  try {
    const body = UpdateSchema.parse(await req.json());
    await requireRole(["admin", "superadmin"]);
    const supabase = supabaseService();
    const patch: any = {};
    for (const k of ["role","name","email","phone"] as const) {
      if (typeof (body as any)[k] !== "undefined") patch[k] = (body as any)[k];
    }
    const { data, error } = await supabase
      .from("dealer_contacts")
      .update(patch)
      .eq("dealer_id", id)
      .eq("id", contactId)
      .select("id,dealer_id,role,name,email,phone,created_at,updated_at")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await ctx.params;
  await requireRole(["admin", "superadmin"]);
  const supabase = supabaseService();
  const { error } = await supabase
    .from("dealer_contacts")
    .delete()
    .eq("dealer_id", id)
    .eq("id", contactId);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
