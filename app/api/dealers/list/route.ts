import { supabaseService } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = supabaseService();

    // Händler (Master mit Geo)
    const { data: all, error } = await supabase.from("v_dealers_map").select("*");

    if (error) {
      return Response.json(
        { error: "Supabase dealers query failed", supabase_error: error },
        { status: 500 }
      );
    }

    const ids = (all ?? []).map((d: any) => d.id).filter(Boolean);
    const manuByDealer = new Map<string, string[]>();

    // Hersteller: best effort (darf NICHT die ganze Karte killen)
    if (ids.length) {
      const { data: manuRows, error: mErr } = await supabase
        .from("dealer_manufacturers")
        .select("*") // wichtig: keine Spaltennamen raten
        .in("dealer_id", ids);

      if (!mErr) {
        for (const r of manuRows ?? []) {
          const dealerId = (r as any).dealer_id as string | undefined;
          if (!dealerId) continue;

          // wir akzeptieren verschiedene Spaltennamen, je nach Schema:
          const key =
            (r as any).manufacturer_key ??
            (r as any).manufacturer ??
            (r as any).manufacturer_id ??
            (r as any).manufacturer_slug;

          if (!key) continue;

          const arr = manuByDealer.get(dealerId) ?? [];
          arr.push(String(key));
          manuByDealer.set(dealerId, arr);
        }
      }
      // Wenn mErr existiert: ignorieren wir ihn bewusst, damit zumindest die Karte läuft.
    }

    const items = (all ?? []).map((d: any) => {
      const manufacturer_keys = manuByDealer.get(d.id) ?? [];
      const has_flyer = manufacturer_keys.includes("flyer");
      return { ...d, has_flyer, manufacturer_keys };
    });

    return Response.json({ items }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
