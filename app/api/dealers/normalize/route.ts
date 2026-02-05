import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

function normStreetSoft(raw: string | null) {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function identityKey(name: string, street: string | null, zip: string | null, city: string | null) {
  const n = normText(name ?? "");
  const s = normStreetSoft(street);
  const z = (zip ?? "").trim();
  const c = normText(city ?? "");
  return [n, s, z, c].join("|");
}

export async function POST() {
  try {
    const sb = supabaseService();
    const step = 500;
    let from = 0;
    let scanned = 0;
    let updated = 0;

    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,zip,city,norm_name,norm_street,norm_city,identity_key")
        .range(from, from + step - 1);

      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;

      scanned += data.length;

      for (const d of data as any[]) {
        const nn = normText(d.name ?? "");
        const ns = normStreetSoft(d.street ?? "");
        const nc = normText(d.city ?? "");
        const ik = identityKey(d.name ?? "", d.street ?? null, d.zip ?? null, d.city ?? null);

        if (d.norm_name !== nn || d.norm_street !== ns || d.norm_city !== nc || d.identity_key !== ik) {
          const { error: uerr } = await sb
            .from("dealers")
            .update({ norm_name: nn, norm_street: ns, norm_city: nc, identity_key: ik })
            .eq("id", d.id);
          if (uerr) return bad(uerr.message, 500);
          updated++;
        }
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ scanned, updated });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}
