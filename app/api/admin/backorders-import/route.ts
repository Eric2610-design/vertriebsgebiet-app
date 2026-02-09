export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/app/api/_admin";
import { createSupabaseServer } from "@/lib/supabase/server";

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseArticleNo(raw: string): string {
  // Artikelnummer: Ziffern vor " - " in Spalte N
  const t = norm(raw);
  const parts = t.split(" - ");
  const left = (parts[0] ?? "").trim();
  // keep only digits
  const m = left.match(/\d+/g);
  return m ? m.join("") : left;
}

function parseCustomerNo(raw: string): string {
  // Kundennummer: erste 9 Ziffern in Spalte G
  const t = norm(raw);
  const first9 = t.slice(0, 9);
  return first9.replace(/\D/g, "").slice(0, 9);
}

function parseDealerName(raw: string): string {
  // Händlername: Text nach " - " in Spalte G
  const t = norm(raw);
  const idx = t.indexOf(" - ");
  if (idx < 0) return "";
  return t.slice(idx + 3).trim();
}

function toISODate(value: any): string | null {
  // XLSX kann Dates als Date, string oder Zahl liefern
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const dt = XLSX.SSF.parse_date_code(value);
    if (dt && dt.y && dt.m && dt.d) {
      const y = String(dt.y).padStart(4, "0");
      const m = String(dt.m).padStart(2, "0");
      const d = String(dt.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  // try string
  const s = norm(value);
  // accept ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // accept dd.mm.yyyy
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = String(m[1]).padStart(2, "0");
    const mo = String(m[2]).padStart(2, "0");
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return null;
}

async function matchDealerByCustomerNo(supabase: any, customerNo: string) {
  if (!customerNo) return null;

  // Prefer Flyer, then ZEG. We store customer numbers in dealer_sources.external_id.
  const sources = ["flyer", "zeg"];
  for (const src of sources) {
    const { data, error } = await supabase
      .from("dealer_sources")
      .select("dealer_id, dealers:dealers(id, country, zip)")
      .eq("source", src)
      .eq("external_id", customerNo)
      .limit(1);
    if (error) continue;
    const row = data?.[0];
    if (row?.dealers) {
      return {
        dealer_id: row.dealer_id,
        dealer_country: row.dealers.country,
        dealer_zip: row.dealers.zip,
      };
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded (field name: file)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Read as raw rows (arrays) so we can reliably address Excel columns by letter
  // regardless of header names.
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  // Skip header row if present
  const rows = rawRows.length > 0 ? rawRows.slice(1) : [];

  const { data: run, error: runErr } = await supabase
    .from("backorder_runs")
    .insert({
      uploaded_by: auth.user?.email ?? auth.user?.id ?? null,
      source_filename: file.name,
      stats: {},
    })
    .select("*")
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? "Failed to create run" }, { status: 500 });
  }

  let inserted = 0;
  let matchedDealers = 0;
  let missingArticle = 0;
  let missingDate = 0;

  const items: any[] = [];

  // Skip header row (row 0) and ignore completely empty rows
  const dataRows = rawRows.slice(1).filter((row) => Array.isArray(row) && row.some((c) => norm(c) !== ""));

  // Column indices: A=0, D=3, G=6, M=12, N=13, V=21, Z=25, AA=26, AH=33, AK=36, AP=41, AR=43, AS=44
  const idx = {
    A: 0,
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

  for (const r of dataRows) {
    const colA = norm(r[idx.A]);
    const orderDate = toISODate(r[idx.D]);
    const customerRaw = norm(r[idx.G]);
    const articleRaw = norm(r[idx.N]);

    const articleNo = parseArticleNo(articleRaw);
    if (!articleNo) {
      missingArticle++;
      continue;
    }
    if (!orderDate) missingDate++;

    const customerNo = parseCustomerNo(customerRaw);
    const dealerName = parseDealerName(customerRaw);

    const dealerMatch = await matchDealerByCustomerNo(supabase, customerNo);
    if (dealerMatch) matchedDealers++;

    items.push({
      run_id: run.id,
      col_a: colA,
      order_date: orderDate,
      col_m: norm(r[idx.M]),
      col_v: norm(r[idx.V]),
      col_z: norm(r[idx.Z]),
      col_aa: norm(r[idx.AA]),
      col_ah: norm(r[idx.AH]),
      col_ak: norm(r[idx.AK]),
      col_ap: norm(r[idx.AP]),
      col_ar: norm(r[idx.AR]),
      col_as: norm(r[idx.AS]),
      customer_raw: customerRaw,
      customer_no: customerNo,
      dealer_name: dealerName,
      article_raw: articleRaw,
      article_no: articleNo,
      dealer_id: dealerMatch?.dealer_id ?? null,
      dealer_country: dealerMatch?.dealer_country ?? null,
      dealer_zip: dealerMatch?.dealer_zip ?? null,
    });
  }

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
    inserted,
    matched_dealers: matchedDealers,
    missing_article_no: missingArticle,
    missing_order_date: missingDate,
  };

  await supabase.from("backorder_runs").update({ stats }).eq("id", run.id);

  return NextResponse.json({ ok: true, run_id: run.id, stats });
}
