import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText, normStreet } from "@/lib/normalize";

function houseNo(street: string) {
  const m = street.match(/\b(\d+\s*[a-z]?)\b/i);
  return m ? m[1].toLowerCase().replace(/\s+/g, "") : "";
}

function jaccard(a: string, b: string) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

function canMerge(master: any, other: any) {
  // zip should match if both present
  const mz = String(master.zip ?? "").trim();
  const oz = String(other.zip ?? "").trim();
  if (mz && oz && mz !== oz) return false;

  // city should match if both present (normalized)
  const mc = normText(master.city ?? "");
  const oc = normText(other.city ?? "");
  if (mc && oc && mc !== oc) return false;

  // country: allow if one side missing
  const mco = String(master.country ?? "").trim().toLowerCase();
  const oco = String(other.country ?? "").trim().toLowerCase();
  if (mco && oco && mco !== oco) return false;

  // street: allow fuzzy if both present
  const ms = normStreet(master.street ?? "");
  const os = normStreet(other.street ?? "");
  if (ms && os) {
    const mh = houseNo(master.street ?? "");
    const oh = houseNo(other.street ?? "");
    if (mh && oh && mh !== oh) return false;
    if (jaccard(ms, os) < 0.8) return false;
  }
  return true;
}

async function safeUpdateTable(sb: any, table: string, col: string, masterId: string, mergeIds: string[]) {
  const { error } = await sb.from(table).update({ [col]: masterId }).in(col, mergeIds);
  if (error) {
    const msg = error.message ?? String(error);
    if (/relation .* does not exist/i.test(msg) || /schema cache/i.test(msg) || /Could not find the table/i.test(msg)) return;
    throw new Error(`${table}: ${msg}`);
  }
}

export async function POST(req: Request) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const master_id = String(body?.master_id ?? "");
    const merge_ids: string[] = Array.isArray(body?.merge_ids) ? body.merge_ids.map(String) : [];
    const reason = String(body?.reason ?? "manual");

    if (!master_id || merge_ids.length === 0) return bad("master_id/merge_ids fehlen", 400);

    const ids = [master_id, ...merge_ids];
    const { data: dealers, error } = await sb.from("dealers").select("*").in("id", ids).limit(500);
    if (error) return bad(error.message, 500);

    const master = (dealers ?? []).find((d) => d.id === master_id);
    if (!master) return bad("Master nicht gefunden", 404);

    for (const d of dealers ?? []) {
      if (d.id === master_id) continue;
      if (!canMerge(master, d)) {
        return bad("Adresse nicht passend genug (ZIP/Ort/Straße/Hausnr) – Merge abgebrochen.", 400, { master, other: d });
      }
    }

    // 1) handle dealer_manufacturers duplicates safely
    const { data: masterM } = await sb
      .from("dealer_manufacturers")
      .select("manufacturer_key")
      .eq("dealer_id", master_id);

    const masterKeys = new Set((masterM ?? []).map((x: any) => x.manufacturer_key));

    if (masterKeys.size) {
      await sb
        .from("dealer_manufacturers")
        .delete()
        .in("dealer_id", merge_ids)
        .in("manufacturer_key", Array.from(masterKeys));
    }

    // move remaining manufacturer links
    await safeUpdateTable(sb, "dealer_manufacturers", "dealer_id", master_id, merge_ids);

    // 2) move foreign keys
    const fks: Array<{ table: string; col: string }> = [
      { table: "dealer_contacts", col: "dealer_id" },
      { table: "visits", col: "dealer_id" },
      { table: "flyer_invoice_lines", col: "dealer_id" },
      { table: "flyer_order_lines", col: "dealer_id" },
    ];
    for (const t of fks) await safeUpdateTable(sb, t.table, t.col, master_id, merge_ids);

    // 3) repoint branches
    await sb.from("dealers").update({ parent_dealer_id: master_id }).in("parent_dealer_id", merge_ids);

    // 4) log (optional)
    await sb.from("merge_log").insert(merge_ids.map((mid) => ({ master_id, merged_id: mid, reason, snapshot: { master, merged: mid } })));

    // 5) delete merged dealers
    const { error: delErr } = await sb.from("dealers").delete().in("id", merge_ids);
    if (delErr) return bad(delErr.message, 500);

    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "merge failed", 500);
  }
}
