import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  try {
    const supabase = supabaseService();

    const step = 1000;
    let from = 0;
    const all: any[] = [];

    while (true) {
      let q = supabase
        .from("v_dealers_map")
        .select(`id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,created_at,updated_at,buying_group_key,sources,source_count`)
        .order("name", { ascending: true })
        .range(from, from + step - 1);

      // Exclude merged/excluded records.
      // IMPORTANT: `status` can be NULL in some schemas; treat NULL as active.
      // Using `NOT IN` would exclude NULLs (because `NULL NOT IN (...)` yields NULL/false).
      // If the column doesn't exist, we fall back in the error handler below.
      q = q.or("status.is.null,status.not.in.(merged,merged_force,excluded)");

      const { data, error } = await q;

      if (error && /column .*status/i.test(error.message)) {
        const retry = await supabase
          .from("v_dealers_map")
          .select(`
            id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,created_at,updated_at,
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

    
// Load manufacturers for these dealers in one query (views cannot embed relationships).
const ids = all.map((d: any) => d.id).filter(Boolean);
const manuByDealer = new Map<string, string[]>();
if (ids.length) {
  const { data: manuRows, error: mErr } = await supabase
    .from("dealer_manufacturers")
    .select("dealer_id,manufacturer_key")
    .in("dealer_id", ids);
  if (mErr) return bad(mErr.message, 500);
  for (const r of manuRows ?? []) {
    const arr = manuByDealer.get((r as any).dealer_id) ?? [];
    arr.push((r as any).manufacturer_key);
    manuByDealer.set((r as any).dealer_id, arr);
  }
}

const items = all.map((d: any) => {
      const manufacturer_keys = manuByDealer.get(d.id) ?? [];
      const has_flyer = manufacturer_keys.includes("flyer");
return { ...d, has_flyer, manufacturer_keys };
    });

    return ok({ items });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
