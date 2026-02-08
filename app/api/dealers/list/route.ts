import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  try {
    const supabase = supabaseService();

    // MINIMAL: nur das, was die Karte wirklich braucht.
    const { data: all, error } = await supabase
      .from("v_dealers_map")
      .select("id,name,street,zip,city,country_iso,lat,lng,geocode_status")
      .order("name", { ascending: true });

    if (error) {
      // Supabase gibt bei fehlenden Spalten oft nur "Bad Request" zurück.
      // Wir geben Details aus, damit du sofort siehst, WAS fehlt.
      return bad(
        JSON.stringify(
          {
            message: error.message,
            details: (error as any).details,
            hint: (error as any).hint,
            code: (error as any).code,
          },
          null,
          2
        ),
        500
      );
    }

    // Hersteller nachladen
    const ids = (all ?? []).map((d: any) => d.id).filter(Boolean);
    const manuByDealer = new Map<string, string[]>();

    if (ids.length) {
      const { data: manuRows, error: mErr } = await supabase
        .from("dealer_manufacturers")
        .select("dealer_id,manufacturer_key")
        .in("dealer_id", ids);

      if (mErr) {
        return bad(
          JSON.stringify(
            {
              message: mErr.message,
              details: (mErr as any).details,
              hint: (mErr as any).hint,
              code: (mErr as any).code,
            },
            null,
            2
          ),
          500
        );
      }

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
