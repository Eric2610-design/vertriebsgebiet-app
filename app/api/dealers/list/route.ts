import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getDealerScope, dealerInTerritory } from "@/app/api/_dealerScope";

export async function GET() {
  try {
    const supabase = supabaseService();
    const scope = await getDealerScope();

    const step = 1000;
    let from = 0;
    const all: any[] = [];

    while (true) {
      let q = supabase
        .from("dealers")
        .select(`
          id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,
          buying_group_key,
          dealer_manufacturers!left(manufacturer_key)
        `)
        .order("name", { ascending: true })
        .range(from, from + step - 1);

      // Exclude soft-merged and excluded records if the column exists.
      // (Fallback: if older schema doesn't have status, we continue without filter.)
      q = q.not("status", "in", "(merged,merged_force,excluded)");

      const { data, error } = await q;

      if (error && /column .*status/i.test(error.message)) {
        const retry = await supabase
          .from("dealers")
          .select(`
            id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,
            buying_group_key,
            dealer_manufacturers!left(manufacturer_key)
          `)
          .order("name", { ascending: true })
          .range(from, from + step - 1);

        if (retry.error) return bad(retry.error.message, 500);
        if (!retry.data || retry.data.length === 0) break;
        all.push(...retry.data);
        if (retry.data.length < step) break;
        from += step;
        continue;
      }

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      all.push(...data);

      if (data.length < step) break;
      from += step;
    }

    let items = all.map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      const has_flyer = manufacturer_keys.includes("flyer");
      delete d.dealer_manufacturers;
      return { ...d, has_flyer, manufacturer_keys };
    });

    // Server-side visibility restriction for reps (country + optional PLZ-territories)
    if (scope) {
      items = items.filter((d: any) => dealerInTerritory(d, scope.territories, scope.allowedCountries));
    }

    return ok({ items });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
