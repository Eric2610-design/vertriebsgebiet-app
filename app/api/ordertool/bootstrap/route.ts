import { cookies } from "next/headers";

import { bad, ok } from "@/app/api/_util";
import { supabaseService } from "@/lib/supabase";
import { fetchAllPaged } from "@/lib/supabasePaging";

type Market = "DE_AT" | "CH";
type Motor = "BOSCH" | "PANASONIC" | "OTHER";
type AvailabilityStatus = "SOFORT" | "ZUKUNFT";
type PriceKind = "STANDARD" | "FIXPREIS" | "SONDERPREIS";

type PricingThresholdRule = {
  market: Market;
  motor: "BOSCH" | "PANASONIC";
  requiresFixprice: boolean;
  minQty: number;
  factor: number;
  active: boolean;
};

type PricingThresholdSettings = {
  version: 1;
  rules: PricingThresholdRule[];
};


type MaxQtySettings = {
  version: number;
  defaultMax: number;
  overrides: Record<string, number>;
};

type PricingAttributeAction = "FIXPREIS" | "SONDERPREIS" | "SCHWELLE";
type PricingAttributeRule = {
  id: string;
  market: Market | "ALL";
  header: string;
  match: string;
  action: PricingAttributeAction;
  // only for SCHWELLE
  minQty?: number;
  factor?: number;
  active?: boolean;
};

type PricingAttributeRuleSettings = {
  version: number;
  rules: PricingAttributeRule[];
};

type FixpriceArticleSettings = {
  byArticleNo?: Record<
    string,
    {
      motor?: string;
      isFixprice?: boolean;
      ek?: number;
      source?: any;
    }
  >;
  source?: any;
};

type StockItemRow = {
  id: string;
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
  availability_plan: any;
  raw: any;
};

const DEFAULT_THRESHOLDS: PricingThresholdSettings = {
  version: 1,
  rules: [
    // DE/AT
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 1, factor: 3.0, active: true },
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 5, factor: 3.2, active: true },
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 10, factor: 3.4, active: true },
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 1, factor: 2.6, active: true },
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 5, factor: 2.7, active: true },
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 10, factor: 2.8, active: true },
    // CH
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 1, factor: 3.2, active: true },
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 5, factor: 3.4, active: true },
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 10, factor: 3.6, active: true },
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 1, factor: 2.8, active: true },
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 5, factor: 2.9, active: true },
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 10, factor: 3.0, active: true },
  ],
};

function clampInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : fallback;
}

function normalizeStr(v: any) {
  return String(v ?? "").trim();
}

function motorFromBrand(brand: string | null): Motor {
  const s = (brand ?? "").toLowerCase();
  if (s.includes("bosch")) return "BOSCH";
  if (s.includes("panasonic")) return "PANASONIC";
  return "OTHER";
}

function parseMonthLabelToIso(label: string): string | null {
  const s0 = String(label ?? "").trim();
  if (!s0) return null;
  const s = s0.replace(/\s+/g, " ");

  // 2026-02
  let m = s.match(/(\d{4})[-/\.](\d{1,2})/);
  if (m) {
    const y = clampInt(m[1]);
    const mo = clampInt(m[2]);
    if (y >= 2000 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, "0")}`;
  }

  // 02/2026 or 02.2026
  m = s.match(/(\d{1,2})\s*[-/\.]\s*(\d{4})/);
  if (m) {
    const mo = clampInt(m[1]);
    const y = clampInt(m[2]);
    if (y >= 2000 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, "0")}`;
  }

  // German month names like "Feb. 2026"
  const monthMap: Record<string, number> = {
    jan: 1,
    januar: 1,
    feb: 2,
    februar: 2,
    "mär": 3,
    "mär": 3,
    mrz: 3,
    maerz: 3,
    märz: 3,
    apr: 4,
    april: 4,
    mai: 5,
    jun: 6,
    juni: 6,
    jul: 7,
    juli: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    okt: 10,
    oktober: 10,
    nov: 11,
    november: 11,
    dez: 12,
    dezember: 12,
  };
  const yMatch = s.match(/(\d{4})/);
  if (!yMatch) return null;
  const year = clampInt(yMatch[1]);
  if (year < 2000) return null;

  const head = s
    .replace(String(year), "")
    .replace(/[^A-Za-zÄÖÜäöüß\. ]/g, " ")
    .replace(/\./g, "")
    .trim()
    .toLowerCase();

  const parts = head.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    const key = p.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
    if (monthMap[p] != null) return `${year}-${String(monthMap[p]).padStart(2, "0")}`;
    if (monthMap[key] != null) return `${year}-${String(monthMap[key]).padStart(2, "0")}`;
  }

  return null;
}

function computeEtaMonth(plan: any): string | null {
  // Be tolerant: older snapshots may use `amount` instead of `qty`.
  const items: { label?: string; qty?: number; amount?: number }[] = Array.isArray(plan) ? plan : [];
  let best: { ym: string; key: number } | null = null;

  for (const it of items) {
    const qty = Number(it?.qty ?? it?.amount ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const label = String(it?.label ?? "");
    const ym = parseMonthLabelToIso(label);
    if (!ym) continue;
    const [y, m] = ym.split("-");
    const key = clampInt(y) * 12 + clampInt(m);
    if (!best || key < best.key) best = { ym, key };
  }
  return best?.ym ?? null;
}

function marketFromQuery(q: string | null): Market {
  return q === "CH" ? "CH" : "DE_AT";
}

function ruleMarketMatches(ruleMarket: Market | "ALL", market: Market) {
  return ruleMarket === "ALL" || ruleMarket === market;
}

export async function GET(req: Request) {
  const jar = await cookies();
  const authed = jar.get("vt_authed")?.value === "1";
  if (!authed) return bad("not_authenticated", 401);

  const url = new URL(req.url);
  const market = marketFromQuery(url.searchParams.get("market"));
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(5000, Math.max(50, clampInt(url.searchParams.get("limit"), 2000)));
  const debug = url.searchParams.get("debug") === "1";

  const supabase = supabaseService();

  // latest run
  const runRes = await supabase
    .from("stock_runs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runRes.error) return bad(runRes.error.message, 500);
  const run = runRes.data ?? null;
  if (!run) {
    return ok({ market, run: null, items: [], thresholds: DEFAULT_THRESHOLDS });
  }

  // settings
  const [thrRes, attrRes, fixRes, maxQtyRes] = await Promise.all([
supabase.from("app_settings").select("value").eq("key", "pricing_thresholds").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "pricing_attribute_rules_v1").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "fixprice_articles").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "ordertool_max_qty_v1").maybeSingle(),
  ]);

  const thresholds: PricingThresholdSettings = (thrRes.data?.value && Array.isArray(thrRes.data.value?.rules))
    ? thrRes.data.value
    : DEFAULT_THRESHOLDS;

  const attrSetting: PricingAttributeRuleSettings | null = attrRes.data?.value ?? null;
  const attrRules: PricingAttributeRule[] = Array.isArray(attrSetting?.rules) ? attrSetting!.rules : [];

  const fixSetting: FixpriceArticleSettings | null = fixRes.data?.value ?? null;
  const maxQtySetting: MaxQtySettings | null = maxQtyRes.data?.value ?? null;
  const maxDefault = Number.isFinite(Number(maxQtySetting?.defaultMax)) ? Math.max(1, Math.floor(Number(maxQtySetting!.defaultMax))) : 40;
  const maxOverrides = (maxQtySetting?.overrides && typeof maxQtySetting.overrides === "object") ? (maxQtySetting.overrides as Record<string, any>) : {};

  const fixMap = fixSetting?.byArticleNo ?? {};

  // items
  const buildStockQuery = () => {
    let q1 = supabase
      .from("stock_items")
      .select(
        "id, sku, name, model_year, series, model, color, frame_size, frame_type, battery, motor_type, motor_brand, price_eur, price_chf, avail_now, avail_total, availability_plan, raw"
      )
      .eq("run_id", run.id)
      .gt("avail_total", 0);

    // market-specific VK filter
    q1 = market === "CH" ? q1.gt("price_chf", 0) : q1.gt("price_eur", 0);

    if (q) {
      // NOTE: Supabase .or does not support parameter binding; keep query small & sanitize %.
      const qq = q.replace(/%/g, "");
      q1 = q1.or(
        [
          `sku.ilike.%${qq}%`,
          `name.ilike.%${qq}%`,
          `model.ilike.%${qq}%`,
          `series.ilike.%${qq}%`,
        ].join(",")
      );
    }

    return q1;
  };

  let rows: StockItemRow[] = [];
  try {
    rows = await fetchAllPaged<StockItemRow>(
      (from, to) =>
        buildStockQuery()
          .order("model", { ascending: true, nullsFirst: false })
          .order("model_year", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: limit }
    );
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load stock items", 500);
  }

  const out = rows.map((it) => {
    const avail_now = clampInt(it.avail_now, 0);
    const avail_total = clampInt(it.avail_total, 0);
    const status: AvailabilityStatus = avail_now > 0 ? "SOFORT" : "ZUKUNFT";
    const eta_month = status === "ZUKUNFT" ? computeEtaMonth(it.availability_plan) : null;

    const vk = market === "CH" ? Number(it.price_chf ?? 0) : Number(it.price_eur ?? 0);
    const currency = market === "CH" ? "CHF" : "EUR";

    const motor: Motor = motorFromBrand(it.motor_brand);

    // Determine Preisart / Fixpreis / Sonderpreis from settings
    let kind: PriceKind = "STANDARD";
    const fromFixMap = fixMap?.[normalizeStr(it.sku)]?.isFixprice;
    if (fromFixMap) kind = "FIXPREIS";

    const raw = it.raw ?? {};
    const extra_thresholds: { minQty: number; factor: number }[] = [];

    for (const r of attrRules) {
      if (!r || r.active === false) continue;
      if (!ruleMarketMatches(r.market as any, market)) continue;

      const rawVal = normalizeStr(raw?.[r.header]);
      if (!rawVal) continue;
      if (rawVal !== normalizeStr(r.match)) continue;

      if (r.action === "SONDERPREIS") kind = "SONDERPREIS";
      else if (r.action === "FIXPREIS" && kind !== "SONDERPREIS") kind = "FIXPREIS";
      else if (r.action === "SCHWELLE") {
        const minQty = Math.max(1, clampInt(r.minQty, 0));
        const factor = Number(r.factor ?? 0);
        if (Number.isFinite(factor) && factor > 0 && minQty > 0) {
          extra_thresholds.push({ minQty, factor });
        }
      }
    }

    return {
      id: it.id,
      sku: it.sku,
      name: it.name,
      model_year: it.model_year,
      series: it.series,
      model: it.model,
      color: it.color,
      frame_size: it.frame_size,
      frame_type: it.frame_type,
      battery: it.battery,
      motor_type: it.motor_type,
      motor_brand: it.motor_brand,
      motor,
      price_kind: kind,
      vk,
      currency,
      avail_now,
      avail_total,
      status,
      eta_month,
      ek_base: (Number.isFinite(Number((fixMap as any)?.[normalizeStr(it.sku)]?.ek)) ? Number((fixMap as any)[normalizeStr(it.sku)]?.ek) : null),
      max_order_qty: Math.max(0, Math.min(avail_total, (() => {
        const ov = Number((maxOverrides as any)[normalizeStr(it.sku)]);
        const cfg = Number.isFinite(ov) && ov > 0 ? Math.floor(ov) : maxDefault;
        return cfg;
      })())),
      availability_plan: it.availability_plan ?? null,
      extra_thresholds,
    };
  });

  if (debug) {
    const violations = out.filter((x) => {
      if (!(x.avail_total > 0)) return true;
      if (!(x.vk > 0)) return true;
      if (x.status === "SOFORT" && !(x.avail_now > 0)) return true;
      if (x.status === "ZUKUNFT" && !(x.avail_now === 0 && x.avail_total > 0)) return true;
      return false;
    });
    return ok({ market, run, items: out, thresholds, debug: { total: out.length, violations: violations.length } });
  }

  return ok({ market, run, items: out, thresholds });
}
