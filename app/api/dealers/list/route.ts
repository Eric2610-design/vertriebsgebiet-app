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
        .from("dealers")
        .select(`
          id,name,street,zip,city,country,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,
          buying_group_key,
          dealer_manufacturers!left(manufacturer_key)
        `)
        .eq("status", "active")
        .is("merged_into", null)
        .order("name", { ascending: true })
        .range(from, from + step - 1);

      const { data, error } = await q;

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      all.push(...data);

      if (data.length < step) break;
      from += step;
    }

    const items = all.map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      const has_flyer = manufacturer_keys.includes("flyer");
      delete d.dealer_manufacturers;
      return { ...d, has_flyer, manufacturer_keys };
    });

    return ok({ items });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
