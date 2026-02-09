import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseService } from "@/lib/supabase";

type AttributeMap = Record<string, string[]>;

type Market = "DE_AT" | "CH";

type PricingAttributeAction = "FIXPREIS" | "SONDERPREIS" | "SCHWELLE";
type PricingAttributeRule = {
  id: string;
  market: Market | "ALL";
  header: string;
  match: string;
  action: PricingAttributeAction;
  minQty?: number;
  factor?: number;
  active?: boolean;
};

type FixpriceArticleSettings = {
  byArticleNo?: Record<
    string,
    {
      motor?: string;
      isFixprice?: boolean;
      source?: any;
    }
  >;
  source?: any;
};

type StockItem = {
  sku: string;
  motor_brand: string | null;
  frame_type: string | null;
  frame_size: string | null;
  color: string | null;
  battery: string | null;
  avail_now: number | null;
  avail_total: number | null;
  price_eur: number | null;
  price_chf: number | null;
  raw: any;
};

function sortValues(values: Set<string>) {
  return Array.from(values)
    .map((v) => String(v).trim())
    .filter((v) => v)
    .sort((a, b) => a.localeCompare(b, "de"));
}

function batteryLabel(tile: {
  battery_min?: number | null;
  battery_max?: number | null;
  battery_note?: string | null;
  battery_tags?: string[] | null;
}) {
  const note = String(tile.battery_note || "").trim();
  if (note) return note;
  const min = tile.battery_min ?? null;
  const max = tile.battery_max ?? null;
  if (min && max) {
    if (min === max) return `${min}Wh`;
    return `${min}–${max}Wh`;
  }
  if (Array.isArray(tile.battery_tags) && tile.battery_tags.length) {
    return String(tile.battery_tags[0] || "").trim();
  }
  return "";
}

async function requireAuthed() {
  const c = await cookies();
  const authed = c.get("vt_authed")?.value === "1";
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function marketFromQuery(q: string | null): Market {
  return q === "CH" ? "CH" : "DE_AT";
}

function normalizeStr(v: any) {
  return String(v ?? "").trim();
}

function ruleMarketMatches(ruleMarket: Market | "ALL", market: Market) {
  return ruleMarket === "ALL" || ruleMarket === market;
}

function motorFromBrand(brand: string | null) {
  const s = (brand ?? "").toLowerCase();
  if (s.includes("bosch")) return "BOSCH";
  if (s.includes("panasonic")) return "PANASONIC";
  return "OTHER";
}

function computePriceKind(
  market: Market,
  sku: string,
  raw: any,
  fixMap: FixpriceArticleSettings | null,
  pricingRules: PricingAttributeRule[]
) {
  // default
  let kind: "STANDARD" | "FIXPREIS" | "SONDERPREIS" = "STANDARD";

  const forcedFix = Boolean(fixMap?.byArticleNo?.[sku]?.isFixprice);
  if (forcedFix) kind = "FIXPREIS";

  // pricing attribute rules (match raw column contents)
  const rList = Array.isArray(pricingRules) ? pricingRules : [];
  for (const r of rList) {
    if (r?.active === false) continue;
    if (!ruleMarketMatches(r.market, market)) continue;
    const header = normalizeStr(r.header);
    const match = normalizeStr(r.match);
    if (!header || !match) continue;

    const cell = normalizeStr(raw?.[header]);
    if (!cell) continue;
    if (!cell.toLowerCase().includes(match.toLowerCase())) continue;

    if (r.action === "SONDERPREIS") return "SONDERPREIS";
    if (r.action === "FIXPREIS") kind = "FIXPREIS";
  }

  return kind;
}

export async function GET(req: Request) {
  const authErr = await requireAuthed();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const market = marketFromQuery(url.searchParams.get("market"));

  const supabase = supabaseService();
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ordertool_attribute_rules_v1")
    .maybeSingle();

  // Optional: pricing rules + fixprice map (for preisart attribute)
  const [{ data: pricingSetting }, { data: fixSetting }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "pricing_attribute_rules_v1").maybeSingle(),
    // canonical key
    supabase.from("app_settings").select("value").eq("key", "fixprice_articles").maybeSingle(),
  ]);
  const pricingRules = (pricingSetting?.value as any)?.rules ?? [];
  const fixMap = (fixSetting?.value as any) as FixpriceArticleSettings | null;

  const runRes = await supabase.from("stock_runs").select("id").order("created_at", { ascending: false }).limit(1).single();
  const runId = runRes.data?.id ?? null;

  let items: StockItem[] = [];
  if (runId) {
    let q = supabase
      .from("stock_items")
      .select("sku,motor_brand,frame_type,frame_size,color,battery,avail_now,avail_total,price_eur,price_chf,raw")
      .eq("run_id", runId)
      .gt("avail_total", 0)
      .limit(5000);

    if (market === "CH") q = q.gt("price_chf", 0);
    else q = q.gt("price_eur", 0);

    const res = await q;
    if (!res.error && Array.isArray(res.data)) items = res.data as any;
  }

  const attributes: AttributeMap = {
    motor: [],
    frame: [],
    color: [],
    size: [],
    battery: [],
    status: [],
    battery_tags: [],
    preisart: [],
  };

  if (Array.isArray(items) && items.length) {
    const motors = new Set<string>();
    const statuses = new Set<string>();
    const batteries = new Set<string>();
    const frames = new Set<string>();
    const colors = new Set<string>();
    const sizes = new Set<string>();
    const preisarten = new Set<string>();

    for (const it of items) {
      const motorBrand = normalizeStr(it.motor_brand);
      if (motorBrand) motors.add(motorBrand);
      const frame = normalizeStr(it.frame_type);
      if (frame) frames.add(frame);
      const color = normalizeStr(it.color);
      if (color) colors.add(color);
      const size = normalizeStr(it.frame_size);
      if (size) sizes.add(size);
      const battery = normalizeStr(it.battery);
      if (battery) batteries.add(battery);

      const now = Number(it.avail_now ?? 0);
      statuses.add(now > 0 ? "SOFORT" : "ZUKUNFT");

      const kind = computePriceKind(market, it.sku, it.raw, fixMap, pricingRules);
      // Keep historic values from the old HTML tool: "ja" (Fixpreis), "sonder" (Sondermodell), "nein" (Standard)
      if (kind === "SONDERPREIS") preisarten.add("sonder");
      else if (kind === "FIXPREIS") preisarten.add("ja");
      else preisarten.add("nein");
    }

    attributes.motor = sortValues(motors);
    attributes.frame = sortValues(frames);
    attributes.color = sortValues(colors);
    attributes.size = sortValues(sizes);
    attributes.battery = sortValues(batteries);
    attributes.status = sortValues(statuses);
    attributes.battery_tags = sortValues(batteries);
    attributes.preisart = sortValues(preisarten);
  }

  const rules = (setting?.value as any)?.rules ?? [];
  const version = (setting?.value as any)?.version ?? 1;

  return NextResponse.json({ attributes, rules, version });
}
