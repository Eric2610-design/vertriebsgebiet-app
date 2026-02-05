import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText, normStreet } from "@/lib/normalize";

function jaccard(a: string, b: string) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

export async function GET() {
  try {
    const sb = supabaseService();
    // fetch all dealers (paginate)
    let from = 0;
    const step = 2000;
    const all: any[] = [];
    while (true) {
      const { data, error } = await sb
        .from("dealers")
        .select("id,name,street,zip,city,country,norm_name,norm_street,norm_city")
        .range(from, from + step - 1);
      if (error) return bad(error.message, 500);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < step) break;
      from += step;
    }

    // group by (norm_name, zip, norm_city)
    const map = new Map<string, any[]>();
    for (const d of all) {
      const k = [d.norm_name || normText(d.name), String(d.zip ?? ""), d.norm_city || normText(d.city)].join("|");
      map.set(k, [...(map.get(k) ?? []), d]);
    }

    const groups: any[] = [];
    for (const [k, arr] of map.entries()) {
      if (arr.length < 2) continue;

      // build subgroups by street similarity
      const buckets: any[][] = [];
      for (const d of arr) {
        const ns = d.norm_street || normStreet(d.street);
        let placed = false;
        for (const b of buckets) {
          const rep = b[0];
          const rs = rep.norm_street || normStreet(rep.street);
          if (ns && rs && jaccard(ns, rs) >= 0.8) {
            b.push(d);
            placed = true;
            break;
          }
        }
        if (!placed) buckets.push([d]);
      }

      for (const b of buckets) {
        if (b.length < 2) continue;
        const address = `${b[0].street ?? ""}, ${b[0].zip ?? ""} ${b[0].city ?? ""}`.trim();
        groups.push({
          key: k + "::" + (b[0].norm_street || normStreet(b[0].street)),
          address,
          dealers: b.map((x) => ({
            id: x.id,
            name: x.name,
            street: x.street,
            zip: x.zip,
            city: x.city,
            country: x.country,
          })),
          suggested_master_id: b[0].id,
        });
      }
    }

    return ok({ ok: true, groups });
  } catch (e: any) {
    return bad(e?.message ?? "failed", 500);
  }
}
