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
        .select(`id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,buying_group_key,sources,source_count`)
        .order("name", { ascending: true })
        .range(from, from + step - 1);

      // Exclude soft-merged and excluded records if the column exists.
      // (Fallback: if older schema doesn't have status, we continue without filter.)
const { data, error } = await q;
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
