import { ok, bad } from "@/app/api/_util";
import { requireUser } from "@/app/api/_auth";

export async function GET() {
  try {
    const { supabase } = await requireUser();

    const step = 1000;
    let from = 0;
    const all: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("dealers")
        .select(`
          id,name,street,zip,city,country,zipcode_int,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,
          dealer_manufacturers!left(manufacturer_key)
        `)
        .order("name", { ascending: true })
        .range(from, from + step - 1);

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

    // RLS macht die Filterung (Admin/SuperAdmin sehen alles, Aussendienst nur sein Gebiet)
    return ok({ items });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "unauthorized") return bad("unauthorized", 401);
    if (msg === "forbidden") return bad("forbidden", 403);
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
