import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";

// Falls du keine util Funktionen hast, hier einfache Response-Helper:
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function bad(message: string, status = 400, extra: any = {}) {
  return json({ error: message, ...extra }, status);
}
function ok(data: any) {
  return json(data, 200);
}

const Body = z.object({
  master_id: z.string().uuid(),
  merge_ids: z.array(z.string().uuid()).min(1),
  reason: z.string().optional(),
});

function normCountry(raw: any) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (["de", "deu", "deutschland", "germany", "ger"].includes(s)) return "DE";
  if (["at", "aut", "österreich", "osterreich", "austria"].includes(s)) return "AT";
  if (["ch", "che", "schweiz", "switzerland"].includes(s)) return "CH";
  return s.toUpperCase();
}

function normStreetSoft(raw: any) {
  return normText(
    String(raw ?? "")
      .toLowerCase()
      .replace(/\bstraße\b/gi, "strasse")
      .replace(/\bstr\.\b/gi, "strasse")
      .replace(/\bstr\b/gi, "strasse")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractHouseNumber(raw: any) {
  const s = String(raw ?? "");
  const m = s.match(/\b(\d+)\s*([a-z])?\b/i);
  if (!m) return null;
  return (m[1] + (m[2] ? m[2].toLowerCase() : "")).trim();
}

function jaccard(a: string, b: string) {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function isStreetSimilar(aRaw: any, bRaw: any) {
  const aN = normStreetSoft(aRaw);
  const bN = normStreetSoft(bRaw);
  if (!aN || !bN) return true; // wenn eins fehlt: nicht blocken

  // Filial-Schutz über Hausnummer:
  const ha = extractHouseNumber(aRaw);
  const hb = extractHouseNumber(bRaw);
  if (ha && hb && ha !== hb) return false;

  if (aN === bN) return true;
  if (aN.includes(bN) || bN.includes(aN)) return true;

  return jaccard(aN, bN) >= 0.82;
}

export async function POST(req: Request) {
  try {
    const sb = supabaseService();
    const body = Body.parse(await req.json());

    const masterId = body.master_id;
    const mergeIds = Array.from(new Set(body.merge_ids.filter((x) => x !== masterId)));
    if (mergeIds.length === 0) return bad("Keine merge_ids übrig (master wurde evtl. mitgegeben).");

    // Händler laden
    const ids = [masterId, ...mergeIds];
    const { data: dealers, error: dErr } = await sb
      .from("dealers")
      .select("id,name,street,zip,city,country")
      .in("id", ids);

    if (dErr) return bad(dErr.message, 500);
    if (!dealers || dealers.length !== ids.length) return bad("Nicht alle Händler gefunden.", 400);

    const master = dealers.find((d: any) => d.id === masterId);
    if (!master) return bad("Master nicht gefunden.", 400);

    // Soft-Checks: PLZ/Ort/Land/Straße
    for (const d of dealers as any[]) {
      if (d.id === masterId) continue;

      // PLZ: block nur wenn beide gesetzt & ungleich
      if (master.zip && d.zip && String(master.zip).trim() !== String(d.zip).trim()) {
        return bad("Merge blockiert: PLZ unterschiedlich");
      }

      // City: block nur wenn beide gesetzt & norm ungleich
      if (master.city && d.city && normText(master.city) !== normText(d.city)) {
        return bad("Merge blockiert: Ort unterschiedlich");
      }

      // Country: optional + normalisiert
      const mc = normCountry(master.country);
      const dc = normCountry(d.country);
      if (mc && dc && mc !== dc) {
        return bad("Merge blockiert: Land unterschiedlich", 400, { master: mc, other: dc });
      }

      // Straße fuzzy + Hausnummer Schutz
      if (!isStreetSimilar(master.street, d.street)) {
        return bad("Merge blockiert: Straße nicht ähnlich genug (Filial-Schutz)", 400);
      }
    }

    // -------------------------
    // 1) dealer_manufacturers dedupe + move
    // -------------------------
    {
      const { data: existing, error } = await sb
        .from("dealer_manufacturers")
        .select("manufacturer_key")
        .eq("dealer_id", masterId);

      if (error) return bad(`dealer_manufacturers existing: ${error.message}`, 500);

      const keys = (existing ?? []).map((x: any) => x.manufacturer_key).filter(Boolean);

      if (keys.length) {
        const { error: delDup } = await sb
          .from("dealer_manufacturers")
          .delete()
          .in("dealer_id", mergeIds)
          .in("manufacturer_key", keys);

        if (delDup) return bad(`dealer_manufacturers dedupe: ${delDup.message}`, 500);
      }

      const { error: moveErr } = await sb
        .from("dealer_manufacturers")
        .update({ dealer_id: masterId })
        .in("dealer_id", mergeIds);

      if (moveErr) return bad(`dealer_manufacturers move: ${moveErr.message}`, 500);
    }

    // -------------------------
    // 2) dealer_sources dedupe + move  (FIX für deinen Unique Constraint)
    // -------------------------
    {
      const { data: existing, error } = await sb
        .from("dealer_sources")
        .select("source, source_external_id")
        .eq("dealer_id", masterId);

      if (error) return bad(`dealer_sources existing: ${error.message}`, 500);

      const pairs = (existing ?? [])
        .map((x: any) => ({ source: x.source, source_external_id: x.source_external_id }))
        .filter((x: any) => x.source && x.source_external_id);

      // Lösche beim merge-Kandidaten alle Quellen-Zeilen, die der Master schon hat
      for (const p of pairs) {
        const { error: delErr } = await sb
          .from("dealer_sources")
          .delete()
          .in("dealer_id", mergeIds)
          .eq("source", p.source)
          .eq("source_external_id", p.source_external_id);

        if (delErr) return bad(`dealer_sources dedupe: ${delErr.message}`, 500);
      }

      const { error: moveErr } = await sb
        .from("dealer_sources")
        .update({ dealer_id: masterId })
        .in("dealer_id", mergeIds);

      if (moveErr) return bad(`dealer_sources move: ${moveErr.message}`, 500);
    }

    // -------------------------
    // 3) Weitere Tabellen umhängen (best effort)
    // -------------------------
    const moveTables: Array<{ table: string; col: string }> = [
      { table: "visits", col: "dealer_id" },
      { table: "dealer_contacts", col: "dealer_id" },
      { table: "flyer_invoice_lines", col: "dealer_id" },
      { table: "flyer_order_lines", col: "dealer_id" },
      { table: "demo_bikes", col: "dealer_id" },
      { table: "appointments", col: "dealer_id" },
    ];

    for (const t of moveTables) {
      const { error } = await sb.from(t.table).update({ [t.col]: masterId } as any).in(t.col, mergeIds);

      // Wenn Tabelle nicht existiert / schema cache: ignorieren
      if (
        error &&
        !/Could not find the table/i.test(error.message) &&
        !/schema cache/i.test(error.message) &&
        !/does not exist/i.test(error.message)
      ) {
        return bad(`${t.table}: ${error.message}`, 500);
      }
    }

    // -------------------------
    // 4) Merge-Log (best effort)
    // -------------------------
    try {
      await sb.from("merge_log").insert(
        mergeIds.map((mid) => ({
          master_id: masterId,
          merged_id: mid,
          reason: body.reason ?? "manual",
          snapshot: { master_id: masterId, merged_id: mid },
        })) as any
      );
    } catch {
      // ignorieren
    }

    // -------------------------
    // 5) Merge-Dealer löschen
    // -------------------------
    const { error: delErr } = await sb.from("dealers").delete().in("id", mergeIds);
    if (delErr) return bad(`dealers delete: ${delErr.message}`, 500);

    return ok({ ok: true, master_id: masterId, merged: mergeIds.length });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
