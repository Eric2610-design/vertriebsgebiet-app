import { supabaseService } from "@/lib/supabase";
import { bad, ok } from "@/app/api/_util";

type AttributeValues = Record<string, string[]>;

type FixpriceEntry = {
  isFixprice?: boolean;
  preisart?: string;
};

function collectAttributeValues(tiles: any[]): AttributeValues {
  const motors = new Set<string>();
  const statuses = new Set<string>();
  const batteryTags = new Set<string>();
  const preisarts = new Set<string>();
  const families = new Set<string>();
  const models = new Set<string>();
  const frames = new Set<string>();
  const motorTypes = new Set<string>();
  const years = new Set<string>();

  for (const tile of tiles) {
    if (tile?.motor) motors.add(String(tile.motor).trim());
    if (tile?.preisart) preisarts.add(String(tile.preisart).trim());
    if (tile?.family) families.add(String(tile.family).trim());
    if (tile?.model) models.add(String(tile.model).trim());
    if (tile?.frame) frames.add(String(tile.frame).trim());
    if (tile?.motor_type) motorTypes.add(String(tile.motor_type).trim());
    if (tile?.yearRule) years.add(String(tile.yearRule).trim());
    if (Array.isArray(tile?.battery_tags)) {
      for (const tag of tile.battery_tags) {
        const value = String(tag || "").trim();
        if (value) batteryTags.add(value);
      }
    }
    if (Array.isArray(tile?.rows)) {
      for (const row of tile.rows) {
        if (row?.status) statuses.add(String(row.status).trim());
      }
    }
  }

  const toSortedArray = (set: Set<string>) =>
    Array.from(set)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"));

  return {
    motor: toSortedArray(motors),
    status: toSortedArray(statuses),
    battery_tags: toSortedArray(batteryTags),
    preisart: toSortedArray(preisarts),
    family: toSortedArray(families),
    model: toSortedArray(models),
    frame: toSortedArray(frames),
    motor_type: toSortedArray(motorTypes),
    yearRule: toSortedArray(years),
  };
}

function normalizePreisart(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "nein";
  if (raw.includes("sonder")) return "sonder";
  if (raw.includes("fix")) return "ja";
  if (raw.includes("kein") || raw.includes("normal")) return "nein";
  return raw;
}

function applyFixpriceToTiles(tiles: any[], fixpriceMap: Record<string, FixpriceEntry> | null): any[] {
  if (!fixpriceMap || !tiles.length) return tiles;
  return tiles.map((tile) => {
    const rows = Array.isArray(tile?.rows) ? tile.rows : [];
    let best: { preisart: string; label?: string } | null = null;
    for (const row of rows) {
      const art = String(row?.art || "").trim();
      if (!art) continue;
      const entry = fixpriceMap[art];
      if (!entry) continue;
      const normalized = normalizePreisart(entry.preisart ?? (entry.isFixprice ? "Fixpreis" : ""));
      if (!best) {
        best = { preisart: normalized, label: entry.preisart };
        continue;
      }
      if (best.preisart === "sonder") continue;
      if (normalized === "sonder") {
        best = { preisart: normalized, label: entry.preisart };
      } else if (best.preisart === "nein" && normalized === "ja") {
        best = { preisart: normalized, label: entry.preisart };
      }
    }

    if (!best) return tile;
    return {
      ...tile,
      preisart: best.preisart,
      preisart_label: best.label || tile?.preisart_label || "",
    };
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = (url.searchParams.get("market") || "DE").toUpperCase();
  const supabase = supabaseService();

  const { data: tilesRow, error: tilesError } = await supabase
    .from("ordertool_stock_tiles")
    .select("tiles, version, market, updated_at")
    .eq("market", market)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tilesError) return bad(tilesError.message, 500);

  const { data: rulesSetting, error: rulesError } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "ordertool_rules")
    .maybeSingle();
  if (rulesError) return bad(rulesError.message, 500);

  const { data: fixpriceSetting, error: fixpriceError } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "fixprice_articles")
    .maybeSingle();
  if (fixpriceError) return bad(fixpriceError.message, 500);

  const tilesRaw = Array.isArray(tilesRow?.tiles) ? tilesRow?.tiles : [];
  const fixpriceMap =
    fixpriceSetting?.value && typeof fixpriceSetting.value === "object"
      ? (fixpriceSetting.value.byArticleNo as Record<string, FixpriceEntry> | undefined)
      : undefined;
  const tiles = applyFixpriceToTiles(tilesRaw, fixpriceMap ?? null);
  const rulesValue = rulesSetting?.value ?? null;
  const rules = Array.isArray(rulesValue?.rules) ? rulesValue.rules : [];
  const rulesVersion = Number.isFinite(rulesValue?.version) ? rulesValue.version : 1;

  return ok({
    market,
    tiles,
    tilesVersion: tilesRow?.version ?? 0,
    rules,
    rulesVersion,
    rulesUpdatedAt: rulesSetting?.updated_at ?? null,
    tilesUpdatedAt: tilesRow?.updated_at ?? null,
    attributeValues: collectAttributeValues(tiles),
  });
}
