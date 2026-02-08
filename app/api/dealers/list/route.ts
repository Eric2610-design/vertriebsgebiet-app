import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

// This endpoint is used by the map and the AD lists.
// It must be able to return > 1,000 dealers (Supabase/PostgREST often defaults
// to 1,000 if you don't paginate explicitly).
//
// Supports:
//   - ?pageSize=5000   (max 10000)
//   - ?includeDisabled=1
//
// Default behaviour: return ACTIVE master dealers (merged_into is null).
export async function GET(req: Request) {
  try {
    const supabase = supabaseService();

    const url = new URL(req.url);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "5000", 10);
    const pageSize = Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 100), 10000) : 5000;
    const includeDisabled = url.searchParams.get("includeDisabled") === "1";

    // We paginate in chunks to reliably fetch all rows.
    const step = 1000;
    let from = 0;
    const all: any[] = [];

    // Safety cap so this endpoint can't explode accidentally.
    const maxRows = pageSize;

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

      // Default: only ACTIVE masters.
      // If a schema is older and doesn't have these columns, we gracefully fallback.
      q = q.is("merged_into", null);
      if (!includeDisabled) q = q.eq("status", "active");

      const { data, error } = await q;

      // Fallback for older schemas.
      if (error && /column .*merged_into/i.test(error.message)) {
        // old schema: no merge feature
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
        if (all.length >= maxRows) break;
        if (retry.data.length < step) break;
        from += step;
        continue;
      }

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
        if (all.length >= maxRows) break;
        if (retry.data.length < step) break;
        from += step;
        continue;
      }

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      all.push(...data);

      if (all.length >= maxRows) break;
      if (data.length < step) break;
      from += step;
    }

    const items = all.map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      const has_flyer = manufacturer_keys.includes("flyer");
      delete d.dealer_manufacturers;
      return { ...d, has_flyer, manufacturer_keys };
    });

    // Enforce cap in case the last page pushed us over.
    return ok({ items: items.slice(0, maxRows) });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
