export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";

function norm(v: any): string {
  return String(v ?? "").trim();
}

/** Artikelnummer: Ziffern vor " - " in Spalte N */
function parseArticleNo(raw: any): string {
  const t = norm(raw);
  if (!t) return "";
  const left = t.split(" - ")[0]?.trim() ?? "";
  const digits = left.replace(/\D/g, "");
  return digits || left;
}

/** Kundennummer: erste 9 Ziffern aus Spalte G */
function parseCustomerNo(raw: any): string {
  const t = norm(raw);
  if (!t) return "";
  const first9 = t.slice(0, 9);
  return first9.replace(/\D/g, "").slice(0, 9);
}

/** Händlername: Text nach " - " aus Spalte G */
function parseDealerName(raw: any): string {
  const t = norm(raw);
  const idx = t.indexOf(" - ");
  if (idx < 0) return "";
  return t.slice(idx + 3).trim();
}

function toISODate(value: any): string | null {
  if (!value) return null;

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

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

  // Prefer Flyer, then ZEG. customer numbers in dealer_sources.external_id.
  const sources = ["flyer", "zeg"];

  for (const src of sources) {
    const { data, error } = await supabase
      .from("dealer_sources")
      .select("dealer_id, dealers:dealers(id, country, zip)")
      .eq("source", src)
      .eq("external_id", customerNo)
      .limit(1);

    if (error) continue;

    const row: any = data?.[0];
    if (row?.dealers) {
      return {
        dealer_id: row.dealer_id ?? null,
        dealer_country: row.dealers.country ?? null,
        dealer_zip: row.dealers.zip ?? null,
      };
    }
  }

  return null;
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
    return NextResponse.json({ error: "No file uploaded (field name: file)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
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
    .filter((row) => Array.isArray(row) && row.some((c) => norm(c) !== ""));

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

  let inserted = 0;
  let matchedDealers = 0;
  let missingArticle = 0;

  const items: any[] = [];

  for (const r of dataRows) {
    const orderDate = toISODate(r[idx.D]);
    const customerRaw = norm(r[idx.G]);
    const articleRaw = norm(r[idx.N]);

    const articleNo = parseArticleNo(articleRaw);
    if (!articleNo) {
      missingArticle++;
      continue;
    }

    const customerNo = parseCustomerNo(customerRaw);
    const dealerName = parseDealerName(customerRaw);

    const dealerMatch = await matchDealerByCustomerNo(supabase, customerNo);
    if (dealerMatch) matchedDealers++;

    items.push({
      run_id: run.id,
      order_date: orderDate,
      article_no: articleNo,

      customer_raw: customerRaw,
      customer_no: customerNo,
      dealer_name: dealerName,

      article_raw: articleRaw,

      col_a: norm(r[idx.A]),
      col_m: norm(r[idx.M]),
      col_v: norm(r[idx.V]),
      col_z: norm(r[idx.Z]),
      col_aa: norm(r[idx.AA]),
      col_ah: norm(r[idx.AH]),
      col_ak: norm(r[idx.AK]),
      col_ap: norm(r[idx.AP]),
      col_ar: norm(r[idx.AR]),
      col_as: norm(r[idx.AS]),

      dealer_id: dealerMatch?.dealer_id ?? null,
      dealer_country: dealerMatch?.dealer_country ?? null,
      dealer_zip: dealerMatch?.dealer_zip ?? null,
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
    inserted,
    matched_dealers: matchedDealers,
    missing_article_no: missingArticle,
  };

  await supabase.from("backorder_runs").update({ stats }).eq("id", run.id);

  return NextResponse.json({ ok: true, run_id: run.id, stats });
}
