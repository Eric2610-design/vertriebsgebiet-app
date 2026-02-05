import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  try {
    const sb = supabaseService();
    let from = 0;
    const step = 2000;
    const ids: string[] = [];
    while (true) {
      const { data, error } = await sb
        .from("dealer_manufacturers")
        .select("dealer_id")
        .eq("manufacturer_key", "flyer")
        .range(from, from + step - 1);
      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;
      ids.push(...data.map((r: any) => r.dealer_id));
      if (data.length < step) break;
      from += step;
    }
    return ok({ ok: true, dealer_ids: Array.from(new Set(ids)) });
  } catch (e:any) {
    return bad(e?.message ?? "failed", 500);
  }
}
