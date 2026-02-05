import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const CreateSchema = z.object({
  model: z.string().trim().min(1),
  serial: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
  status: z.enum(["available","in_use","service","lost"]).optional(),
  location_type: z.enum(["dealer","warehouse"]),
  dealer_id: z.string().uuid().optional().nullable(),
  warehouse_name: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
  notes: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
});

export async function GET(_: Request, ctx: { params: Promise<{ email: string }> }) {
  const { email } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("demo_bikes")
    .select("id,rep_email,model,serial,status,location_type,dealer_id,warehouse_name,notes,created_at,updated_at, dealers(name,zip,city)")
    .eq("rep_email", repEmail)
    .order("updated_at", { ascending: false });
  if (error) return bad(error.message, 500);
  const items = (data ?? []).map((r: any) => ({
    ...r,
    dealer: r.dealers ? { name: r.dealers.name, zip: r.dealers.zip, city: r.dealers.city } : null,
    dealers: undefined,
  }));
  return ok({ items });
}

export async function POST(req: Request, ctx: { params: Promise<{ email: string }> }) {
  const { email } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  try {
    const body = CreateSchema.parse(await req.json());
    const supabase = supabaseService();

    const payload: any = {
      rep_email: repEmail,
      model: body.model,
      serial: body.serial,
      status: body.status ?? "available",
      location_type: body.location_type,
      dealer_id: body.location_type === "dealer" ? (body.dealer_id ?? null) : null,
      warehouse_name: body.location_type === "warehouse" ? body.warehouse_name : null,
      notes: body.notes,
    };

    const { data, error } = await supabase
      .from("demo_bikes")
      .insert(payload)
      .select("id,rep_email,model,serial,status,location_type,dealer_id,warehouse_name,notes,created_at,updated_at")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
