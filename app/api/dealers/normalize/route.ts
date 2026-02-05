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
    let skipped_collisions = 0;

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
          // If a unique constraint exists on (norm_name, norm_street, zip, norm_city),
// an update could fail when two rows become identical after normalization.
// We therefore pre-check and skip those collisions (they remain as-is and can be merged manually).
const { data: coll, error: cerr } = await sb
  .from("dealers")
  .select("id")
  .eq("norm_name", nn)
  .eq("norm_street", ns)
  .eq("zip", d.zip ?? "")
  .eq("norm_city", nc)
  .neq("id", d.id)
  .limit(1);

if (cerr) return bad(cerr.message, 500);
if (coll && coll.length > 0) {
  skipped_collisions++;
} else {
  const { error: uerr } = await sb
    .from("dealers")
    .update({ norm_name: nn, norm_street: ns, norm_city: nc, identity_key: ik })
    .eq("id", d.id);

  if (uerr) return bad(uerr.message, 500);
  updated++;
}
        }
      }

      if (data.length < step) break;
      from += step;
    }

    return ok({ scanned, updated, skipped_collisions });
  } catch (e: any) {
    return bad(e?.message ?? "normalize failed", 500);
  }
}
