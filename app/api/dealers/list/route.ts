import { supabaseService } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = supabaseService();

    const { data: all, error } = await supabase.from("v_dealers_map").select("*");

    if (error) {
      return Response.json(
        {
          error: "Supabase query failed",
          supabase_error: error,
        },
        { status: 500 }
      );
    }

    // Hersteller nachladen (optional)
    const ids = (all ?? []).map((d: any) => d.id).filter(Boolean);
    const manuByDealer = new Map<string, string[]>();

    if (ids.length) {
      const { data: manuRows, error: mErr } = await supabase
        .from("dealer_manufacturers")
        .select("dealer_id,manufacturer_key")
        .in("dealer_id", ids);

      if (mErr) {
        return Response.json(
          {
            error: "Manufacturer query failed",
            supabase_error: mErr,
          },
          { status: 500 }
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

    return Response.json({ items }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
