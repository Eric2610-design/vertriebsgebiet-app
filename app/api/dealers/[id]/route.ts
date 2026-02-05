import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

const DealerUpdateSchema = z.object({
  dealer: z.object({
    name: z.string().min(1),
    street: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    opening_hours: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    geocode_status: z.string().nullable().optional(),
  })
});

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const supabase = supabaseService();
  const { data: dealer, error } = await supabase
    .from("dealers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return bad(error.message, 500);
  if (!dealer) return ok({ dealer: null });

  const { data: manufacturers } = await supabase
    .from("dealer_manufacturers")
    .select("manufacturer_key")
    .eq("dealer_id", params.id);

  const { data: sources } = await supabase
    .from("dealer_sources")
    .select("id,source,external_id,source_url,created_at")
    .eq("dealer_id", params.id)
    .order("source", { ascending: true });

  const { data: visits } = await supabase
    .from("visits")
    .select("id,note,created_at")
    .eq("dealer_id", params.id)
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("dealer_contacts")
    .select("id,role,name,email,phone,created_at,updated_at")
    .eq("dealer_id", params.id)
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  return ok({
    dealer,
    manufacturers: (manufacturers ?? []).map((m: any) => ({ key: m.manufacturer_key })),
    // sources are kept server-side, but not shown in UI
    sources: sources ?? [],
    visits: visits ?? [],
    contacts: contacts ?? [],
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const supabase = supabaseService();
    const body = DealerUpdateSchema.parse(await req.json());

    const name = body.dealer.name.trim();
    const street = body.dealer.street?.trim() ?? null;
    const city = body.dealer.city?.trim() ?? null;
    const zip = body.dealer.zip?.trim() ?? null;

    const patch: any = {
      name,
      street,
      city,
      zip,
      country: body.dealer.country?.trim() ?? null,
      phone: body.dealer.phone?.trim() ?? null,
      email: body.dealer.email?.trim() ?? null,
      website: body.dealer.website?.trim() ?? null,
      opening_hours: body.dealer.opening_hours?.trim() ?? null,
      notes: body.dealer.notes?.trim() ?? null,
      norm_name: normText(name),
      norm_street: normText(street ?? ""),
      norm_city: normText(city ?? ""),
    };

    if (typeof body.dealer.lat === "number" && typeof body.dealer.lng === "number") {
      patch.lat = body.dealer.lat;
      patch.lng = body.dealer.lng;
      patch.geocode_status = "manual";
    }

    const { error } = await supabase.from("dealers").update(patch).eq("id", params.id);
    if (error) return bad(error.message, 500);

    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const supabase = supabaseService();
  const { error } = await supabase.from("dealers").delete().eq("id", params.id);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
