import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const CreateSchema = z.object({
  dealer_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().optional().nullable(),
  with_whom: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
  notes: z.string().trim().optional().or(z.literal("")).transform((v)=>v || null),
});

export async function GET(_: Request, ctx: { params: Promise<{ email: string }> }) {
  const { email } = await ctx.params;
  const repEmail = decodeURIComponent(email);
  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,rep_email,dealer_id,title,starts_at,ends_at,with_whom,notes,status,report,done_at,created_at,updated_at, dealers(name,zip,city)")
    .eq("rep_email", repEmail)
    .order("starts_at", { ascending: false })
    .limit(5000);
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
      dealer_id: body.dealer_id ?? null,
      title: (body.title?.trim() || "Termin"),
      starts_at: new Date(body.starts_at).toISOString(),
      ends_at: body.ends_at ? new Date(body.ends_at).toISOString() : null,
      with_whom: body.with_whom,
      notes: body.notes,
      status: "open",
    };

    const { data, error } = await supabase
      .from("appointments")
      .insert(payload)
      .select("id,rep_email,dealer_id,title,starts_at,ends_at,with_whom,notes,status,report,done_at,created_at,updated_at")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
