import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { requireAdmin } from "@/app/api/_admin";
import * as XLSX from "xlsx";

type StockRow = Record<string, any>;

const MONTH_PREFIX = "Menge Produktions-vorschlag u. -auftrag";

const bucketAvail = (n: number) => {
  if (n <= 0) return "0";
  if (n < 10) return String(n);
  if (n < 49) return "10+";
  if (n < 100) return "49+";
  return "100+";
};

const normDigits = (s: any) => String(s ?? "").trim().replace(/\D+/g, "");

const parseNumber = (v: any) => {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9,.-]/g, "");
  let t = cleaned;
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (t.includes(",") && !t.includes(".")) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

const pickHeader = (headers: string[], idx: number, tokens: string[], fallback: string) => {
  if (idx >= 0 && headers[idx]) return headers[idx];
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  for (const h of headers) {
    const lh = String(h || "").toLowerCase();
    if (!lh) continue;
    if (lowerTokens.every((t) => lh.includes(t))) return h;
  }
  return fallback;
};

const pickMonths = (headers: string[]) => {
  const looksLikeDate = (s: string) =>
    /\b20\d{2}\b/.test(s) ||
    /\b\d{1,2}\s*[-./]\s*20\d{2}\b/.test(s) ||
    /\b20\d{2}\s*[-./]\s*\d{1,2}\b/.test(s) ||
    /\b[A-Za-zÄÖÜäöü]{3,}\.?(?:\s*[-/ ]\s*)\d{2}\b/.test(s);
  return headers.filter((h) => String(h || "").startsWith(MONTH_PREFIX) && looksLikeDate(String(h || "")));
};

const parseMonthLabel = (colName: string) => {
  const s = String(colName || "").trim();
  const monthMap: Record<string, string> = {
    jan: "Jan", feb: "Feb", mär: "Mär", mar: "Mär", apr: "Apr", mai: "Mai",
    jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", okt: "Okt", nov: "Nov", dez: "Dez",
  };
  let m = s.match(/\b([A-Za-zÄÖÜäöü]{3,})\.?\s+(20\d{2})\b/);
  if (m) {
    const monKey = m[1].toLowerCase().slice(0, 3).replace("ä", "ä");
    return `${monthMap[monKey] || m[1].slice(0, 3)} ${m[2]}`;
  }
  m = s.match(/\b(20\d{2})\s*[-./]\s*(\d{1,2})\b/);
  if (m) {
    const mo = Number(m[2]);
    return `${monthMap[String(mo).padStart(2, "0")] || monthMap[Object.keys(monthMap)[mo - 1]] || String(mo)} ${m[1]}`;
  }
  m = s.match(/\b(\d{1,2})\s*[-./]\s*(20\d{2})\b/);
  if (m) {
    const mo = Number(m[1]);
    return `${monthMap[String(mo).padStart(2, "0")] || monthMap[Object.keys(monthMap)[mo - 1]] || String(mo)} ${m[2]}`;
  }
  m = s.match(/\b([A-Za-zÄÖÜäöü]{3,})\.?\s*[-/ ]\s*(\d{2})\b/);
  if (m) {
    const monKey = m[1].toLowerCase().slice(0, 3).replace("ä", "ä");
    return `${monthMap[monKey] || m[1].slice(0, 3)} 20${m[2]}`;
  }
  return s;
};

const getBattery = (raw: any) => {
  const m = String(raw ?? "").match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
};

const buildTiles = (rows: StockRow[], headers: string[], freeStockHeader: string, fixpriceSet: Set<string>) => {
  const monthCols = pickMonths(headers);
  const wgHeader = pickHeader(headers, 0, ["warengr"], "Warengruppen");
  const uvpHeader = pickHeader(headers, 14, ["uvp", "eur"], "UVP in EUR (Unverb. VK Preis) (V75000001)");
  const groups = new Map<string, any>();

  for (const r of rows) {
    const wgRaw = String(r[wgHeader] || "").trim();
    const wgCode = (wgRaw.match(/^(\d{3})/) || [])[1] || "";
    if (wgCode && wgCode !== "513") continue;

    const model = String(r["Modell"] || "").trim();
    if (!model) continue;
    const art = normDigits(r["Basisartikelnummer"] || "");
    if (!art) continue;

    const xNow = parseNumber(r[freeStockHeader] || 0);
    let totalFuture = 0;
    for (const mc of monthCols) totalFuture += parseNumber(r[mc] || 0);
    const xTotal = Math.trunc((xNow || 0) + (totalFuture || 0));
    if (xTotal <= 0) continue;

    const year = Math.trunc(parseNumber(r["Modelljahr"] || 0));
    const famSrc = String(r["Serie/Familie"] || "").trim();
    const motor = String(r["Motor Hersteller FLYER"] || "").trim();
    const motorType = String(r["Motortyp FLYER"] || "").trim();
    const frame = String(r["Rahmentyp"] || "").trim();
    const color = String(r["Farbe"] || "").trim();
    const size = String(r["Rahmengröße"] || "").trim();
    const uvp = Math.trunc(parseNumber(r[uvpHeader] || 0));
    const battery = getBattery(r["Akkustärke"]);

    let status = "sofort";
    let eta = "sofort";
    if (xNow <= 0) {
      let cum = 0;
      for (const mc of monthCols) {
        cum += parseNumber(r[mc] || 0);
        if (cum > 0) {
          eta = parseMonthLabel(mc);
          status = "zukunft";
          break;
        }
      }
    }

    const isFix = fixpriceSet.has(art);
    const preisart = isFix ? "ja" : "";
    const preisartLabel = isFix ? "Fixpreis" : "";

    const groupKey = [famSrc, model, year, frame, motor, motorType, uvp, battery, preisart].join("||");
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: 0,
        family: famSrc,
        motor,
        motor_type: motorType,
        model,
        yearRule: year,
        frame,
        uvp,
        fixpreis: preisart,
        battery_min: battery || 0,
        battery_max: battery || 0,
        family_id: `${famSrc}_${model}_${year}_${frame}`.replace(/\s+/g, "_"),
        preisart,
        preisart_label: preisartLabel,
        battery_tags: battery ? [`${battery}Wh`] : [],
        battery_note: "",
        rows: [],
        ek_min: 0,
        ek_max: 0,
      });
    }
    const t = groups.get(groupKey);
    t.rows.push({
      art,
      color,
      colorHex: "",
      size,
      variant: "",
      status,
      statusColor: "",
      display: bucketAvail(xTotal),
      eta,
      x: Math.trunc(xTotal),
      plannedQty: Math.trunc(totalFuture || 0),
      ek: 0,
    });
  }

  const tiles: any[] = [];
  let id = 1;
  for (const t of groups.values()) {
    t.id = id++;
    tiles.push(t);
  }
  return tiles;
};

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_missing" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json: StockRow[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[] || [];

  const supabase = supabaseService();
  const { data: freeSetting } = await supabase
    .from("app_settings")
    .select("*")
    .eq("key", "ordertool_free_stock_column")
    .maybeSingle();
  const freeHeader = String(freeSetting?.value || pickHeader(headers, -1, ["freier", "verfügbarer", "bestand"], "Freier verfügbarer Bestand"));

  const { data: fixSetting } = await supabase
    .from("app_settings")
    .select("*")
    .eq("key", "fixprice_articles")
    .maybeSingle();
  const fixValue = fixSetting?.value ?? {};
  const fixRows = fixValue?.rows ?? [];
  const fixFromRows = (Array.isArray(fixRows) ? fixRows : []).map((r: any) => normDigits(r.articleNo));
  const fixFromMap = fixValue?.byArticleNo ? Object.keys(fixValue.byArticleNo) : [];
  const fixSet = new Set([...fixFromRows, ...fixFromMap].filter(Boolean));

  const tilesDE = buildTiles(json, headers, freeHeader, fixSet);

  const payload = {
    updatedAt: new Date().toISOString(),
    tilesDE,
    tilesCH: [],
    sourceName: file.name,
  };

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "ordertool_stock_tiles", value: payload, updated_at: payload.updatedAt }, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updatedAt: payload.updatedAt });
}
