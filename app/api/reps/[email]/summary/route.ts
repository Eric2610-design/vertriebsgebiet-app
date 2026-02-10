import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { fetchAllPaged } from "@/lib/supabasePaging";

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

  // Load dealers (paged) and filter in code by territory ranges.
  // Important: PostgREST often caps responses at ~1000 rows even if `.limit()` is higher.
  const ranges = territories ?? [];
  const countries = Array.from(
    new Set(
      ranges
        .map((r: any) => String(r.country ?? "DE").toUpperCase())
        .filter((c: string) => !!c)
    )
  );

  let dealers: any[] = [];
  try {
    const orCountry = countries.length
      ? `country.is.null,country.in.(${countries.join(",")})`
      : "country.is.null";

    dealers = await fetchAllPaged<any>(
      (from, to) =>
        supabase
          .from("dealers")
          .select("id,name,zip,city,country,buying_group_key")
          .or(orCountry)
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 50000 }
    );
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }

  const dealerItems = (dealers ?? []).filter((d: any) => {
    const p = plz2(d.zip);
    if (p == null) return false;
    const c = String(d.country ?? "DE").toUpperCase();
    return ranges.some((r: any) => String(r.country ?? "DE").toUpperCase() === c && p >= r.plz2_from && p <= r.plz2_to);
  });

  // manufacturer pictograms
  const manuByDealer = new Map<string, string[]>();
  const dealerIds = dealerItems.map((d: any) => d.id);
  if (dealerIds.length) {
    const chunkSize = 600;
    for (let i = 0; i < dealerIds.length; i += chunkSize) {
      const chunk = dealerIds.slice(i, i + chunkSize);
      const { data: dm, error: dmErr } = await supabase
        .from("dealer_manufacturers")
        .select("dealer_id,manufacturer_key")
        .in("dealer_id", chunk);
      if (dmErr) return bad(dmErr.message, 500);
      for (const row of dm ?? []) {
        const did = String((row as any).dealer_id);
        const mk = String((row as any).manufacturer_key);
        if (!manuByDealer.has(did)) manuByDealer.set(did, []);
        manuByDealer.get(did)!.push(mk);
      }
    }
  }

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
      dealer: d ? { id: d.id, name: d.name, zip: d.zip, city: d.city } : null,
    };
  });

  // last visit per dealer
  const lastVisitByDealer = new Map<string, string>();
  for (const v of visits) {
    if (!lastVisitByDealer.has(v.dealer_id)) lastVisitByDealer.set(v.dealer_id, v.created_at);
  }
  const dealersWithLast = dealerItems.map((d: any) => ({
    ...d,
    manufacturer_keys: manuByDealer.get(d.id) ?? [],
    last_visit_at: lastVisitByDealer.get(d.id) ?? null,
  }));

  return ok({ profile, territories: ranges, dealers: dealersWithLast, timeline });
}
