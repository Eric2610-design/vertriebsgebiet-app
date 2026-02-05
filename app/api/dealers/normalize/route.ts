import { supabaseService } from "@/lib/supabase";
import { normText, normStreet } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

export async function POST() {
  try {
    const sb = supabaseService();
    let from = 0;
    const step = 500;
    let scanned = 0;
    let updated = 0;

    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,city,norm_name,norm_street,norm_city")
        .range(from, from + step - 1);

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      scanned += data.length;

      for (const d of data) {
        const nn = normText(d.name ?? "");
        const ns = normStreet(d.street ?? "");
        const nc = normText(d.city ?? "");
        if (d.norm_name !== nn || d.norm_street !== ns || d.norm_city !== nc) {
          const { error: upErr } = await sb
            .from("dealers")
            .update({ norm_name: nn, norm_street: ns, norm_city: nc, updated_at: new Date().toISOString() })
            .eq("id", d.id);
          if (upErr) return bad(upErr.message, 500);
          updated++;
        }
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ ok: true, scanned, updated });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}
