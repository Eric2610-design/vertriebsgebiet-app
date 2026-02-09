import * as XLSX from "xlsx";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

type BackorderItemInsert = {
  run_id: string;
  order_no: string | null;
  pos_no: string | null;
  order_date: string | null; // ISO date (YYYY-MM-DD) or null
  article_no: string;
  customer_raw: string | null;
  customer_no: string | null;
  dealer_name: string | null;
  article_raw: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
  col_ar: string | null;
  col_as: string | null;
  dealer_id: string | null;
  dealer_country: string | null;
  dealer_zip: string | null;
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseCustomerNo(raw: string): string | null {
  // first 9 digits
  const m = raw.replace(/\s+/g, " ").match(/(\d{9})/);
  return m ? m[1] : null;
}

function splitCustomerAndDealer(raw: string): { customer_no: string | null; dealer_name: string | null } {
  const s = toStr(raw);
  const customer_no = parseCustomerNo(s);
  const parts = s.split(" - ");
  const dealer_name = parts.length >= 2 ? parts.slice(1).join(" - ").trim() : null;
  return { customer_no, dealer_name: dealer_name || null };
}

function parseArticleNo(raw: string): string {
  const s = toStr(raw);
  // digits before " - "
  const before = s.split(" - ")[0] ?? "";
  return before.replace(/\D+/g, "");
}

function excelDateToISO(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }
  const s = toStr(v);
  if (!s) return null;
  // dd.mm.yyyy
  const m1 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yyyy = Number(m1[3]);
    const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }
  // ISO or other parseable
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return bad("admin_only", 403);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return bad("Keine Datei gefunden", 400);

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return bad("Keine Tabelle gefunden", 400);

  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  if (!rawRows.length) return ok({ ok: true, inserted: 0, rows_in_file: 0 });

  // Data rows start at row 2 (index 1). Row 1 is header.
  const dataRows = rawRows.slice(1);
  const rowsInFile = dataRows.length;

  // Column indices
  const IDX = {
    A: 0,
    B: 1,
    D: 3,
    G: 6,
    M: 12,
    N: 13,
    V: 21,
    Z: 25,
    AA: 26,
    AH: 33,
    AK: 36,
    AP: 41,
    AR: 43,
    AS: 44,
  };

  // Deduplicate by (order_no, pos_no): last wins
  const map = new Map<string, any[]>();
  for (const r of dataRows) {
    const orderNo = toStr(r[IDX.A]);
    const posNo = toStr(r[IDX.B]);
    if (!orderNo || !posNo) continue;
    map.set(`${orderNo}__${posNo}`, r);
  }

  const deduped = Array.from(map.values());
  const rowsAfterDedupe = deduped.length;

  // Collect customer numbers for dealer matching
  const customerNos = Array.from(
    new Set(
      deduped
        .map((r) => parseCustomerNo(toStr(r[IDX.G])))
        .filter((x): x is string => Boolean(x))
    )
  );

  const supabase = supabaseService();

  // Create run
  const runRes = await supabase
    .from("backorder_runs")
    .insert({ source_filename: file.name, stats: { rows_in_file: rowsInFile, rows_after_dedupe: rowsAfterDedupe } })
    .select("id")
    .single();

  if (runRes.error || !runRes.data?.id) return bad(runRes.error?.message || "run_insert_failed", 500);
  const runId = runRes.data.id as string;

  // Dealer match map: external_id -> best dealer
  const dealerMap = new Map<string, { dealer_id: string; country: string | null; zip: string | null }>();
  if (customerNos.length) {
    for (const ids of chunk(customerNos, 500)) {
      const res = await supabase
        .from("dealer_sources")
        .select("external_id,source,dealer_id,dealers(country,zip)")
        .in("external_id", ids)
        .in("source", ["flyer", "zeg"]);

      if (res.error) return bad(res.error.message, 500);

      for (const row of res.data ?? []) {
        const external_id = toStr((row as any).external_id);
        const source = toStr((row as any).source).toLowerCase();
        const dealer_id = toStr((row as any).dealer_id);
        const country = (row as any)?.dealers?.country ?? null;
        const zip = (row as any)?.dealers?.zip ?? null;
        if (!external_id || !dealer_id) continue;

        const existing = dealerMap.get(external_id);
        if (!existing) {
          dealerMap.set(external_id, { dealer_id, country, zip });
        } else {
          // prefer flyer over zeg
          if (source === "flyer") {
            dealerMap.set(external_id, { dealer_id, country, zip });
          }
        }
      }
    }
  }

  // Build items
  const items: BackorderItemInsert[] = [];
  let missingArticle = 0;
  let missingDate = 0;
  let matchedDealers = 0;

  for (const r of deduped) {
    const order_no = toStr(r[IDX.A]) || null;
    const pos_no = toStr(r[IDX.B]) || null;
    if (!order_no || !pos_no) continue;

    const order_date = excelDateToISO(r[IDX.D]);
    if (!order_date) missingDate++;

    const customer_raw = toStr(r[IDX.G]) || null;
    const { customer_no, dealer_name } = splitCustomerAndDealer(customer_raw || "");

    const article_raw = toStr(r[IDX.N]) || null;
    const article_no = parseArticleNo(article_raw || "");
    if (!article_no) {
      missingArticle++;
      continue;
    }

    const dealer = customer_no ? dealerMap.get(customer_no) : undefined;
    if (dealer?.dealer_id) matchedDealers++;

    items.push({
      run_id: runId,
      order_no,
      pos_no,
      order_date,
      article_no,
      customer_raw,
      customer_no,
      dealer_name,
      article_raw,
      col_m: toStr(r[IDX.M]) || null,
      col_v: toStr(r[IDX.V]) || null,
      col_z: toStr(r[IDX.Z]) || null,
      col_aa: toStr(r[IDX.AA]) || null,
      col_ah: toStr(r[IDX.AH]) || null,
      col_ak: toStr(r[IDX.AK]) || null,
      col_ap: toStr(r[IDX.AP]) || null,
      col_ar: toStr(r[IDX.AR]) || null,
      col_as: toStr(r[IDX.AS]) || null,
      dealer_id: dealer?.dealer_id ?? null,
      dealer_country: dealer?.country ?? null,
      dealer_zip: dealer?.zip ?? null,
    });
  }

  // Insert
  let inserted = 0;
  for (const batch of chunk(items, 1000)) {
    const ins = await supabase.from("backorder_items").insert(batch);
    if (ins.error) return bad(ins.error.message, 500);
    inserted += batch.length;
  }

  // Update run stats
  await supabase
    .from("backorder_runs")
    .update({
      stats: {
        rows_in_file: rowsInFile,
        rows_after_dedupe: rowsAfterDedupe,
        inserted,
        matched_dealers: matchedDealers,
        missing_article_no: missingArticle,
        missing_order_date: missingDate,
      },
    })
    .eq("id", runId);

  return ok({ ok: true, run_id: runId, rows_in_file: rowsInFile, rows_after_dedupe: rowsAfterDedupe, inserted });
}
