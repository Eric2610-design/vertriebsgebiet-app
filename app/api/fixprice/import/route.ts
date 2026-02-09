import { bad, ok } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";
import * as XLSX from "xlsx";

function normStr(v: any) {
  return String(v ?? "").trim();
}

function normMotor(v: any): string {
  const s = normStr(v).toUpperCase();
  if (s.includes("BOSCH")) return "BOSCH";
  if (s.includes("PANASONIC")) return "PANASONIC";
  if (s.includes("PINION")) return "PINION";
  return s || "UNKNOWN";
}

function isFixpriceFromPreisart(v: any): boolean {
  const s = normStr(v).toLowerCase();
  // per user: Spalte E nicht leer => Fixpreis/Sonderpreis; leer => Normalpreis.
  return s.length > 0;
}

function findColumns(rows: any[]): { articleKey: string; motorKey?: string; preisartKey?: string } | null {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0] ?? {});
  const lower = keys.map((k) => [k, k.toLowerCase()]);
  const article = lower.find(([, l]) => l.includes("artikel") && l.includes("nummer"))?.[0]
    ?? lower.find(([, l]) => l === "artikelnummer")?.[0]
    ?? lower.find(([, l]) => l.includes("basisartikel"))?.[0];
  if (!article) return null;

  const motor = lower.find(([, l]) => l === "motor" || l.includes("motor"))?.[0];
  // Column E in your sheet is "Preisart" (Fixpreis/Sonderpreis/leer)
  const preisart = lower.find(([, l]) => l.includes("preisart"))?.[0]
    ?? lower.find(([, l]) => l.includes("fixpreis"))?.[0]
    ?? lower.find(([, l]) => l.includes("sonderpreis"))?.[0];

  return { articleKey: article, motorKey: motor, preisartKey: preisart };
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

  const byArticleNo: Record<string, { motor?: string; isFixprice: boolean }> = {};
  let usedSheet: string | null = null;
  let totalRows = 0;

  // Prefer sheets likely containing the table; fallback to scanning all.
  const preferred = ["EK_Schwellen", "EK_Stammdaten", "Schwellen", "Regeln"];
  const sheetNames = wb.SheetNames.slice();
  const ordered = [...preferred.filter((p) => sheetNames.includes(p)), ...sheetNames.filter((s) => !preferred.includes(s))];

  for (const name of ordered) {
    const ws = wb.Sheets[name];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
    if (!rows.length) continue;

    const cols = findColumns(rows);
    if (!cols) continue;

    usedSheet = name;
    for (const r of rows) {
      const art = normStr(r[cols.articleKey]).replace(/\.0$/, "");
      if (!art) continue;
      if (!/^\d+$/.test(art)) continue; // only numeric article numbers
      const motor = cols.motorKey ? normMotor(r[cols.motorKey]) : undefined;

      // If we don't have explicit preisart col, fall back to "Spalte E": cannot reliably address in json.
      const preisartVal = cols.preisartKey ? r[cols.preisartKey] : "";
      const isFix = isFixpriceFromPreisart(preisartVal);

      byArticleNo[art] = { motor, isFixprice: isFix };
      totalRows += 1;
    }
    break; // first matching sheet wins
  }

  if (!usedSheet) {
    return bad("no_matching_sheet_found", 400);
  }

  const value = {
    version: 1,
    source: {
      filename: file.name,
      sheet: usedSheet,
      imported_at: new Date().toISOString(),
      rows: totalRows,
      unique_articles: Object.keys(byArticleNo).length,
    },
    byArticleNo,
  };

  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key: "fixprice_articles", value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("*")
    .maybeSingle();

  if (error) return bad(error.message, 500);
  return ok({ setting: data });
}
