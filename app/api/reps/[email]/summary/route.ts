import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

function plz2(zip?: string | null): number | null {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_: Request, ctx: { params: Promise<{ email: string }> }) {
  const params = await ctx.params;
  const email = decodeURIComponent(params.email);
  const supabase = supabaseService();

  const { data: profile, error: perr } = await supabase
    .from("profiles")
    .select("id,display_name,email,role")
    .eq("email", email)
    .maybeSingle();
  if (perr) return bad(perr.message, 500);
  if (!profile) return ok({ profile: null });

  const { data: territories, error: terr } = await supabase
    .from("territories")
    .select("id,profile_email,country,plz2_from,plz2_to")
    .eq("profile_email", email);
  if (terr) return bad(terr.message, 500);

  // Load dealers with pagination (Supabase/PostgREST may cap single requests).
  // We only want ACTIVE masters here.
  const step = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("dealers")
      .select(
        `
          id,name,street,zip,city,country_iso,zipcode_int,buying_group_key,
          dealer_manufacturers!left(manufacturer_key)
        `
      )
      .eq("status", "active")
      .is("merged_into", null)
      .order("name", { ascending: true })
      .range(from, from + step - 1);

    if (error) return bad(error.message, 500);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }

  const ranges = territories ?? [];
  const dealerItems = all
    .map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      delete d.dealer_manufacturers;
      return { ...d, manufacturer_keys };
    })
    .filter((d: any) => {
      const p = plz2(d.zip);
      if (p == null) return false;
      const c = String(d.country_iso ?? "DE").toUpperCase();
      return ranges.some((r: any) => String(r.country ?? "DE").toUpperCase() === c && p >= r.plz2_from && p <= r.plz2_to);
    });

  const dealerIds = dealerItems.map((d: any) => d.id);
  let visits: any[] = [];
  if (dealerIds.length) {
    const { data: v, error: verr } = await supabase
      .from("visits")
      .select("id,dealer_id,note,created_at")
      .in("dealer_id", dealerIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (verr) return bad(verr.message, 500);
    visits = v ?? [];
  }

  const dealerById = new Map<string, any>();
  for (const d of dealerItems) dealerById.set(d.id, d);

  const timeline = visits.map((v) => {
    const d = dealerById.get(v.dealer_id);
    return {
      id: v.id,
      created_at: v.created_at,
      note: v.note,
      dealer: d ? { id: d.id, name: d.name, zip: d.zip, city: d.city, manufacturer_keys: d.manufacturer_keys, buying_group_key: d.buying_group_key } : null,
    };
  });

  // last visit per dealer
  const lastVisitByDealer = new Map<string, string>();
  for (const v of visits) {
    if (!lastVisitByDealer.has(v.dealer_id)) lastVisitByDealer.set(v.dealer_id, v.created_at);
  }
  const dealersWithLast = dealerItems.map((d: any) => ({
    ...d,
    last_visit_at: lastVisitByDealer.get(d.id) ?? null,
  }));

  return ok({ profile, territories: ranges, dealers: dealersWithLast, timeline });
}
