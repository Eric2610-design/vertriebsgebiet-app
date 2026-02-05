import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

const BodySchema = z.object({
  master_id: z.string().uuid(),
  merge_ids: z.array(z.string().uuid()).min(1),
  reason: z.string().optional(),
});

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  norm_city: string;
};

function normStreetSoft(raw: string | null) {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function extractHouseNumber(street: string | null) {
  const m = String(street ?? "").match(/\b(\d+)\s*([a-z])?\b/i);
  if (!m) return null;
  return (m[1] + (m[2] ? m[2].toLowerCase() : "")).trim();
}

function jaccard(a: string, b: string) {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function isStreetSimilar(aRaw: string | null, bRaw: string | null) {
  const a = normStreetSoft(aRaw);
  const b = normStreetSoft(bRaw);
  if (!a || !b) return true; // missing street should not block

  const ha = extractHouseNumber(aRaw);
  const hb = extractHouseNumber(bRaw);
  if (ha && hb && ha !== hb) return false; // protect branches with different numbers

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  return jaccard(a, b) >= 0.82;
}

async function moveForeignKeys(supabase: ReturnType<typeof supabaseService>, masterId: string, mergeIds: string[]) {
  // 1) dealer_manufacturers needs dedupe, because (dealer_id, manufacturer_key) is unique
  const { data: existing, error: exErr } = await supabase
    .from("dealer_manufacturers")
    .select("manufacturer_key")
    .eq("dealer_id", masterId);
  if (exErr) throw new Error(`dealer_manufacturers: ${exErr.message}`);

  const keys = (existing ?? []).map((x: any) => x.manufacturer_key);
  if (keys.length) {
    const { error: delErr } = await supabase
      .from("dealer_manufacturers")
      .delete()
      .in("dealer_id", mergeIds)
      .in("manufacturer_key", keys);
    if (delErr) throw new Error(`dealer_manufacturers dedupe: ${delErr.message}`);
  }

  const { error: mvManErr } = await supabase
    .from("dealer_manufacturers")
    .update({ dealer_id: masterId } as any)
    .in("dealer_id", mergeIds);
  if (mvManErr) throw new Error(`dealer_manufacturers move: ${mvManErr.message}`);

  // 2) all other tables: best-effort (ignore missing tables / schema cache)
  const tables: Array<{ table: string; col: string }> = [
    { table: "dealer_sources", col: "dealer_id" },
    { table: "visits", col: "dealer_id" },
    { table: "dealer_contacts", col: "dealer_id" },
    { table: "flyer_invoice_lines", col: "dealer_id" },
    { table: "flyer_order_lines", col: "dealer_id" },
    { table: "demo_bikes", col: "dealer_id" },
    { table: "appointments", col: "dealer_id" },
  ];

  for (const t of tables) {
    const { error } = await supabase
      .from(t.table)
      .update({ [t.col]: masterId } as any)
      .in(t.col, mergeIds);

    if (
      error &&
      !/relation .* does not exist/i.test(error.message) &&
      !/schema cache/i.test(error.message) &&
      !/Could not find the table/i.test(error.message)
    ) {
      throw new Error(`${t.table}: ${error.message}`);
    }
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = BodySchema.parse(await req.json());

    const mergeIds = Array.from(new Set(body.merge_ids)).filter((id) => id !== body.master_id);
    if (mergeIds.length === 0) return bad("Keine gültigen Merge-IDs", 400);

    const ids = [body.master_id, ...mergeIds];
    const { data: dealers, error } = await supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,norm_city")
      .in("id", ids)
      .limit(200);

    if (error) return bad(error.message, 500);
    if (!dealers || dealers.length !== ids.length) return bad("Nicht alle Händler gefunden", 400);

    const rows = dealers as unknown as DealerRow[];
    const master = rows.find((d) => d.id === body.master_id)!;

    // Less strict address check:
    // - ZIP must match if both present
    // - City must match if both present (norm)
    // - Country only blocks if both present and different
    // - Street: fuzzy match (and protects different house numbers)
    for (const d of rows) {
      if (d.id === master.id) continue;

      const mz = (master.zip ?? "").trim();
      const dz = (d.zip ?? "").trim();
      if (mz && dz && mz !== dz) return bad("Merge blockiert: PLZ unterschiedlich.", 400);

      const mc = (master.city ?? "").trim();
      const dc = (d.city ?? "").trim();
      if (mc && dc && normText(mc) !== normText(dc)) return bad("Merge blockiert: Ort unterschiedlich.", 400);

      const mco = (master.country ?? "").trim();
      const dco = (d.country ?? "").trim();
      if (mco && dco && mco !== dco) return bad("Merge blockiert: Land unterschiedlich.", 400);

      if (!isStreetSimilar(master.street, d.street)) {
        return bad("Merge blockiert: Straße nicht ähnlich genug (Filial-Schutz).", 400);
      }
    }

    const snapshot = { master, merged: rows.filter((d) => d.id !== master.id) };

    await moveForeignKeys(supabase, body.master_id, mergeIds);

    // Branch links: point branches to surviving master
    await supabase
      .from("dealers")
      .update({ parent_dealer_id: body.master_id })
      .in("parent_dealer_id", mergeIds);

    // Merge log
    for (const mid of mergeIds) {
      const { error: logErr } = await supabase.from("merge_log").insert({
        master_id: body.master_id,
        merged_id: mid,
        reason: body.reason ?? null,
        snapshot,
      } as any);
      if (
        logErr &&
        !/relation .* does not exist/i.test(logErr.message) &&
        !/schema cache/i.test(logErr.message) &&
        !/Could not find the table/i.test(logErr.message)
      ) {
        throw new Error(`merge_log: ${logErr.message}`);
      }
    }

    const { error: delErr } = await supabase.from("dealers").delete().in("id", mergeIds);
    if (delErr) return bad(delErr.message, 500);

    return ok({ ok: true, master_id: body.master_id, merged: mergeIds });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
