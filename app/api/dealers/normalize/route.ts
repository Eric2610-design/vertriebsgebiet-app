import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

// Very conservative street normalization to improve duplicate detection.
// We only touch norm_* fields, not the display fields.
function normStreet(raw: unknown): string {
  let s = String(raw ?? "").trim().toLowerCase();
  // common German abbreviations
  s = s
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstra\b/gi, "strasse")
    .replace(/\bstrasse\b/gi, "strasse");
  // normalize house number separators like "12a", "12 A", "12-a"
  s = s.replace(/(\d)\s*[-\/]\s*(\d)/g, "$1 $2");
  return normText(s);
}

export async function POST() {
  try {
    const sb = supabaseService();
    let from = 0;
    const step = 500;
    let updated = 0;
    let scanned = 0;

    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,zip,city,country,norm_name,norm_street,norm_city")
        .range(from, from + step - 1);

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      scanned += data.length;

      const patch: any[] = [];
      for (const d of data) {
        const nn = normText(d.name ?? "");
        const ns = normStreet(d.street ?? "");
        const nc = normText(d.city ?? "");
        if (d.norm_name !== nn || d.norm_street !== ns || d.norm_city !== nc) {
          patch.push({ id: d.id, norm_name: nn, norm_street: ns, norm_city: nc });
        }
      }

      if (patch.length) {
        // update in small batches to keep payloads modest
        for (let i = 0; i < patch.length; i += 200) {
          const chunk = patch.slice(i, i + 200);
          const { error: upErr } = await sb.from("dealers").upsert(chunk, { onConflict: "id" });
          if (upErr) return bad(upErr.message, 500);
        }
        updated += patch.length;
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ scanned, updated });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}