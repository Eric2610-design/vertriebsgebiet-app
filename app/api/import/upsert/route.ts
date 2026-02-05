import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { identityKey, normText, normStreet } from "@/lib/normalize";
import { z } from "zod";

const DealerSchema = z.object({
  name: z.string(),
  street: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  manufacturers: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const items = z.array(DealerSchema).parse(body?.dealers ?? []);

    // ensure manufacturers exist
    const allKeys = Array.from(new Set(items.flatMap((d) => d.manufacturers)));
    if (allKeys.length) {
      const { error: manErr } = await sb.from("manufacturers").upsert(
        allKeys.map((k) => ({ key: k, name: k })),
        { onConflict: "key" }
      );
      if (manErr) return bad(manErr.message, 500);
    }

    // upsert dealers by identity_key
    const dealerRows = items.map((d) => {
      const ik = identityKey(d);
      return {
        identity_key: ik,
        name: d.name.trim(),
        street: d.street ?? null,
        zip: d.zip ?? null,
        city: d.city ?? null,
        country: d.country ?? null,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        norm_name: normText(d.name),
        norm_street: normStreet(d.street ?? ""),
        norm_city: normText(d.city ?? ""),
        updated_at: new Date().toISOString(),
      };
    });

    // chunked upsert
    const upserted: any[] = [];
    for (let i = 0; i < dealerRows.length; i += 500) {
      const chunk = dealerRows.slice(i, i + 500);
      const { data, error } = await sb
        .from("dealers")
        .upsert(chunk, { onConflict: "identity_key", defaultToNull: false })
        .select("id,identity_key");
      if (error) return bad(error.message, 500);
      upserted.push(...(data ?? []));
    }

    // map identity_key -> id
    const map = new Map<string, string>(upserted.map((r) => [r.identity_key, r.id]));

    // upsert dealer_manufacturers
    const links: any[] = [];
    for (const d of items) {
      const id = map.get(identityKey(d));
      if (!id) continue;
      for (const k of d.manufacturers) links.push({ dealer_id: id, manufacturer_key: k });
    }
    for (let i = 0; i < links.length; i += 1000) {
      const chunk = links.slice(i, i + 1000);
      const { error } = await sb.from("dealer_manufacturers").upsert(chunk, { onConflict: "dealer_id,manufacturer_key" });
      if (error) return bad(error.message, 500);
    }

    return ok({ ok: true, dealers: upserted.length, manufacturers: allKeys.length, links: links.length });
  } catch (e: any) {
    return bad(e?.message ?? "import failed", 400);
  }
}
