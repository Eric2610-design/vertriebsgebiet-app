import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getUserContext, isAdminRole, inRanges } from "@/app/api/_userctx";

const CreateSchema = z.object({
  role: z.enum(["Geschaeftsfuehrer","Verkauf","Werkstatt","Buchhaltung","Sonstiges"]),
  name: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v)=>v || null),
  phone: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
});

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userCtx = await getUserContext();
  const supabase = supabaseService();

  // Zwischenlösung: block access if dealer not in territory
  if (!isAdminRole(userCtx.role)) {
    const { data: dealer } = await supabase
      .from("dealers")
      .select("id,country,zipcode_int")
      .eq("id", id)
      .maybeSingle();
    if (userCtx.role !== "aussendienst" || !inRanges(dealer?.country, dealer?.zipcode_int ?? null, userCtx.ranges)) {
      return bad("forbidden", 403);
    }
  }
  const { data, error } = await supabase
    .from("dealer_contacts")
    .select("id,dealer_id,role,name,email,phone,created_at,updated_at")
    .eq("dealer_id", id)
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  if (error) return bad(error.message, 500);
  return ok({ items: data ?? [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = CreateSchema.parse(await req.json());
    const userCtx = await getUserContext();
    if (!isAdminRole(userCtx.role)) return bad("forbidden", 403);
    const supabase = supabaseService();
    const { data, error } = await supabase
      .from("dealer_contacts")
      .insert({
        dealer_id: id,
        role: body.role,
        name: body.name,
        email: body.email,
        phone: body.phone,
      })
      .select("id,dealer_id,role,name,email,phone,created_at,updated_at")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
