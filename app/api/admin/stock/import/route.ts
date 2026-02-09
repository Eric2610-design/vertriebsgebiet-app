import * as XLSX from "xlsx";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

type StockItemInsert = {
  run_id: string;
  sku: string;
  name: string | null;
  model_year: number | null;
  series: string | null;
  model: string | null;
  color: string | null;
  frame_size: string | null;
  frame_type: string | null;
  battery: string | null;
  motor_type: string | null;
  motor_brand: string | null;
  price_eur: number | null;
  price_chf: number | null;
  avail_now: number | null;
  avail_total: number | null;
  availability_plan: Array<{ label: string; qty: number }> | null;
  unit: string | null;
  raw: Record<string, any>;
};

function pick(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const val = row?.[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
  }
  return null;
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) return bad("Keine Datei gefunden", 400);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const name = wb.SheetNames?.[0];
    if (!name) return bad("Keine Tabelle gefunden", 400);

    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
    const total = rows.length;

    const items = rows
      .map((row) => {
        const skuRaw = pick(row, ["Basisartikelnummer", "Artikelnummer", "SKU"]);
        const sku = skuRaw ? String(skuRaw).trim() : "";
        if (!sku) return null;

        const availabilityKeys = Object.keys(row).filter((key) =>
          key.startsWith("Menge Produktions-vorschlag u. -auftrag ")
        );
        const availability_plan = availabilityKeys
          .map((key) => ({
            label: key.replace("Menge Produktions-vorschlag u. -auftrag ", "").trim(),
            qty: toNumber(row[key]) ?? 0,
          }))
          .filter((entry) => entry.qty > 0);

        return {
          run_id: "",
          sku,
          name: pick(row, ["Basisartikelbezeichnung", "Artikelbezeichnung", "Bezeichnung"])?.toString() ?? null,
          model_year: toNumber(pick(row, ["Modelljahr"])) as number | null,
          series: pick(row, ["Serie/Familie", "Serie", "Familie"])?.toString() ?? null,
          model: pick(row, ["Modell"])?.toString() ?? null,
          color: pick(row, ["Farbe"])?.toString() ?? null,
          frame_size: pick(row, ["Rahmengröße", "Rahmenhöhe"])?.toString() ?? null,
          frame_type: pick(row, ["Rahmentyp"])?.toString() ?? null,
          battery: pick(row, ["Akkustärke"])?.toString() ?? null,
          motor_type: pick(row, ["Motortyp FLYER", "Motortyp"])?.toString() ?? null,
          motor_brand: pick(row, ["Motor Hersteller FLYER", "Motor Hersteller"])?.toString() ?? null,
          price_eur: toNumber(pick(row, ["UVP in EUR (Unverb. VK Preis) (V75000001)", "VK EUR", "UVP EUR"])),
          price_chf: toNumber(pick(row, ["UVP in CHF (Unverb. VK Preis) (V75000002)", "VK CHF", "UVP CHF"])),
          avail_now: toNumber(pick(row, ["Freier verfügbarer Bestand"])) as number | null,
          avail_total: toNumber(
            pick(row, ["Freier verfügbarer Bestand inkl. Produktionsvorschläge u. -aufträge", "Verfügbar gesamt"])
          ) as number | null,
          availability_plan: availability_plan.length ? availability_plan : null,
          unit: pick(row, ["Bestands-\neinheit", "Bestandseinheit"])?.toString() ?? null,
          raw: row,
        } satisfies StockItemInsert;
      })
      .filter(Boolean) as StockItemInsert[];

    const valid = items.length;
    const invalid = total - valid;

    const supabase = supabaseService();
    const runRes = await supabase
      .from("stock_runs")
      .insert({
        file_name: file.name,
        rows_total: total,
        rows_valid: valid,
        rows_invalid: invalid,
      })
      .select("id")
      .single();

    if (runRes.error || !runRes.data) return bad(runRes.error?.message || "Snapshot konnte nicht angelegt werden", 500);

    const runId = runRes.data.id as string;
    const withRun = items.map((item) => ({ ...item, run_id: runId }));

    for (const batch of chunk(withRun, 500)) {
      const insertRes = await supabase.from("stock_items").insert(batch);
      if (insertRes.error) return bad(insertRes.error.message, 500);
    }

    return ok({
      run_id: runId,
      rows_total: total,
      rows_valid: valid,
      rows_invalid: invalid,
    });
  } catch (e: any) {
    return bad(e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler", e?.status || 400);
  }
}
