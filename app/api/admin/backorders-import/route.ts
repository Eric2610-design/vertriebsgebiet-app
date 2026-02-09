export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";

const COL = {
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
} as const;

type DealerMatch = {
  dealer_id: string | null;
  dealer_country: string | null;
  dealer_zip: string | null;
  source: "flyer" | "zeg";
};

function norm(v: any): string {
  return String(v ?? "").trim();
}

function parseArticleNo(raw: any): string | null {
  const t = norm(raw);
  if (!t) return null;
  const left = t.split(" - ")[0]?.trim() ?? "";
  const digits = left.replace(/\D/g, "");
  return digits.length ? digits : null;
}

function parseCustomerNo(raw: any): string | null {
  const t = norm(raw);
  if (!t) return null;
  const first9 = t.slice(0, 9).replace(/\D/g, "");
  return first9.length ? first9 : null;
}

function parseDealerName(raw: any): string | null {
  const t = norm(raw);
  const idx = t.indexOf(" - ");
  if (idx < 0) return null;
  const name = t.slice(idx + 3).trim();
  return name.length ? name : null;
}

function toISODate(value: any): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const dt = XLSX.SSF.parse_date_code(value);
    if (dt?.y && dt?.m && dt?.d) {
      const y = String(dt.y).padStart(4, "0");
      const m = String(dt.m).padStart(2, "0");
      const d = String(dt.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const s = norm(value);
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = String(m[1]).padStart(2, "0");
    const mo = String(m[2]).padStart(2, "0");
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

function hasRowValues(row: any[]): boolean {
  return row.some((cell) => norm(cell) !== "");
}

async function loadDealerMatches(supabase: ReturnType<typeof supabaseService>, customerNos: string[]) {
  const map = new Map<string, DealerMatch>();
  const chunkSize = 500;

  for (let i = 0; i < customerNos.length; i += chunkSize) {
    const chunk = customerNos.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("dealer_sources")
      .select("external_id, source, dealer_id, dealers(country, zip)")
      .in("source", ["flyer", "zeg"])
      .in("external_id", chunk);

    if (error || !data) continue;

    for (const row of data as any[]) {
      const externalId = String(row.external_id ?? "");
      if (!externalId) continue;
      const source = row.source as "flyer" | "zeg";
      const existing = map.get(externalId);
      if (existing && existing.source === "flyer") continue;
      if (existing && existing.source === source) continue;
      map.set(externalId, {
        dealer_id: row.dealer_id ?? null,
        dealer_country: row.dealers?.country ?? null,
        dealer_zip: row.dealers?.zip ?? null,
        source,
      });
    }
  }

  return map;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "admin_only" }, { status: e?.status ?? 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "xlsx_parse_failed" }, { status: 400 });
  }
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return NextResponse.json({ error: "missing_sheet" }, { status: 400 });
  }
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  const supabase = supabaseService();

  const { data: run, error: runErr } = await supabase
    .from("backorder_runs")
    .insert({
      source_filename: file.name,
      stats: {},
    })
    .select("*")
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? "Failed to create run" }, { status: 500 });
  }

  // Skip header row and ignore empty rows
  const dataRows = rawRows
    .slice(1)
    .filter((row) => Array.isArray(row) && hasRowValues(row as any[]));

  const deduped = new Map<string, any[]>();
  for (const row of dataRows) {
    const orderNo = norm((row as any[])[COL.A]);
    const posNo = norm((row as any[])[COL.B]);
    const key = `${orderNo}__${posNo}`;
    deduped.set(key, row as any[]);
  }

  const uniqueCustomers = new Set<string>();
  for (const row of deduped.values()) {
    const customerNo = parseCustomerNo(row[COL.G]);
    if (customerNo) uniqueCustomers.add(customerNo);
  }

  const dealerMatches = await loadDealerMatches(supabase, Array.from(uniqueCustomers));

  let inserted = 0;
  let matchedDealers = 0;
  let missingArticle = 0;
  let missingOrderDate = 0;

  const items: any[] = [];

  for (const row of deduped.values()) {
    const orderNo = norm(row[COL.A]) || null;
    const posNo = norm(row[COL.B]) || null;
    const orderDate = toISODate(row[COL.D]);
    if (!orderDate) {
      missingOrderDate++;
    }

    const articleNo = parseArticleNo(row[COL.N]);
    if (!articleNo) {
      missingArticle++;
      continue;
    }

    const customerNo = parseCustomerNo(row[COL.G]);
    const dealerName = parseDealerName(row[COL.G]);

    const dealerMatch = customerNo ? dealerMatches.get(customerNo) : null;
    if (dealerMatch) matchedDealers++;

    items.push({
      run_id: run.id,
      order_no: orderNo,
      pos_no: posNo,
      order_date: orderDate ?? null,
      article_no: articleNo,
      customer_raw: norm(row[COL.G]) || null,
      customer_no: customerNo,
      dealer_name: dealerName,
      dealer_id: dealerMatch?.dealer_id ?? null,
      dealer_country: dealerMatch?.dealer_country ?? null,
      dealer_zip: dealerMatch?.dealer_zip ?? null,
      article_raw: norm(row[COL.N]) || null,
      col_a: norm(row[COL.A]) || null,
      col_m: norm(row[COL.M]) || null,
      col_v: norm(row[COL.V]) || null,
      col_z: norm(row[COL.Z]) || null,
      col_aa: norm(row[COL.AA]) || null,
      col_ah: norm(row[COL.AH]) || null,
      col_ak: norm(row[COL.AK]) || null,
      col_ap: norm(row[COL.AP]) || null,
      col_ar: norm(row[COL.AR]) || null,
      col_as: norm(row[COL.AS]) || null,
    });
  }

  // Insert in chunks
  const chunkSize = 1000;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const { error } = await supabase.from("backorder_items").insert(chunk);
    if (error) {
      return NextResponse.json({ error: error.message, run_id: run.id }, { status: 500 });
    }
    inserted += chunk.length;
  }

  const stats = {
    rows_in_file: dataRows.length,
    rows_after_dedupe: deduped.size,
    inserted,
    matched_dealers: matchedDealers,
    missing_article_no: missingArticle,
    missing_order_date: missingOrderDate,
  };

  await supabase.from("backorder_runs").update({ stats }).eq("id", run.id);

  return NextResponse.json({ ok: true, run_id: run.id, stats });
}
