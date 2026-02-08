import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  try {
    const supabase = supabaseService();

    // 1) Nur Master mit Geo (kommt aus der View)
    const { data: all, error } = await supabase
      .from("v_dealers_map")
      .select(
        "id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,created_at,updated_at,buying_group_key,sources,source_count"
      )
      .order("name", { ascending: true });

    if (error) return bad(error.message, 500);

    // 2) Hersteller-Piktogramme separat nachladen (Views können nicht sauber embed-joinen)
    const ids = (all ?? []).map((d: any) => d.id).filter(Boolean);
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

    const items = (all ?? []).map((d: any) => {
      const manufacturer_keys = manuByDealer.get(d.id) ?? [];
      const has_flyer = manufacturer_keys.includes("flyer");
      return { ...d, has_flyer, manufacturer_keys };
    });

    return ok({ items });
  } catch (e: any) {
    return bad(e?.message ?? "Server error", 500);
  }
}
