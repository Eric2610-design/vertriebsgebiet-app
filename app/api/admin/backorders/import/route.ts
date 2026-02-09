import { bad, ok } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// Column letter -> zero-based index
const COL = {
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

function normStr(v: any) {
  return String(v ?? "").trim();
}

function parseCustomerAndDealer(g: any): { customerNo: string | null; dealerName: string | null } {
  const s = normStr(g);
  if (!s) return { customerNo: null, dealerName: null };
  // first 9 digits = customer number
  const cust = s.slice(0, 9).replace(/\D/g, "");
  const parts = s.split(" - ");
  const dealer = parts.length >= 2 ? parts.slice(1).join(" - ").trim() : null;
  return { customerNo: cust.length ? cust : null, dealerName: dealer || null };
}

function parseArticleNoFromN(n: any): string | null {
  const s = normStr(n);
  if (!s) return null;
  const before = s.split(" - ")[0].trim();
  const digits = before.replace(/\D/g, "");
  return digits.length ? digits : null;
}

function parseExcelDate(v: any): string | null {
  if (v == null || v === "") return null;
  // Excel serial number
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const yyyy = String(d.y).padStart(4, "0");
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  // try ISO-ish string
  const s = normStr(v);
  if (!s) return null;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  // try German dd.mm.yyyy
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return bad("admin_only", 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("invalid_formdata");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("missing_file");

  const buf = Buffer.from(await file.arrayBuffer());

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (e: any) {
    return bad(e?.message ?? "xlsx_parse_failed", 400);
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return bad("missing_sheet", 400);

  // Read as array-of-arrays to reliably address columns by letter.
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  if (!aoa.length) return bad("empty_sheet", 400);

  const supabase = supabaseService();

  // Create run
  const { data: run, error: runErr } = await supabase
    .from("backorder_runs")
    .insert({ source_filename: file.name, stats: { sheet: sheetName } })
    .select("*")
    .single();

  if (runErr || !run) return bad(runErr?.message ?? "failed_to_create_run", 500);

  let inserted = 0;
  let skippedNoArticle = 0;
  let skippedNoDate = 0;

  const items: any[] = [];
  // Skip header row if present; we do a simple heuristic: if column D is not a date on first row.
  const startRow = 1;

  for (let i = startRow; i < aoa.length; i++) {
    const row = aoa[i] || [];

    const colN = row[COL.N];
    const articleNo = parseArticleNoFromN(colN);
    if (!articleNo) {
      skippedNoArticle++;
      continue;
    }

    const dateIso = parseExcelDate(row[COL.D]);
    if (!dateIso) {
      skippedNoDate++;
      continue;
    }

    const { customerNo, dealerName } = parseCustomerAndDealer(row[COL.G]);

    items.push({
      run_id: run.id,
      col_a: normStr(row[COL.A]) || null,
      order_date: dateIso,
      col_m: normStr(row[COL.M]) || null,
      col_v: normStr(row[COL.V]) || null,
      col_z: normStr(row[COL.Z]) || null,
      col_aa: normStr(row[COL.AA]) || null,
      col_ah: normStr(row[COL.AH]) || null,
      col_ak: normStr(row[COL.AK]) || null,
      col_ap: normStr(row[COL.AP]) || null,
      col_ar: normStr(row[COL.AR]) || null,
      col_as: normStr(row[COL.AS]) || null,

      col_g: normStr(row[COL.G]) || null,
      customer_no: customerNo,
      dealer_name: dealerName,

      col_n: normStr(colN) || null,
      article_no: articleNo,
    });
  }

  // Insert in chunks
  const chunkSize = 1000;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const { error } = await supabase.from("backorder_items").insert(chunk);
    if (error) return bad(error.message, 500);
    inserted += chunk.length;
  }

  const stats = {
    sheet: sheetName,
    rows_total: aoa.length,
    rows_imported: inserted,
    skipped_no_article: skippedNoArticle,
    skipped_no_date: skippedNoDate,
  };

  await supabase.from("backorder_runs").update({ stats }).eq("id", run.id);

  return ok({ run_id: run.id, stats });
}
