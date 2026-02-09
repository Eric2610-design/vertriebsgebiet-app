import { supabaseService } from "@/lib/supabase";
import { bad, ok } from "@/app/api/_util";

type AttributeValues = Record<string, string[]>;

function collectAttributeValues(tiles: any[]): AttributeValues {
  const motors = new Set<string>();
  const statuses = new Set<string>();
  const batteryTags = new Set<string>();
  const preisarts = new Set<string>();

  for (const tile of tiles) {
    if (tile?.motor) motors.add(String(tile.motor).trim());
    if (tile?.preisart) preisarts.add(String(tile.preisart).trim());
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
  };
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

  const tiles = Array.isArray(tilesRow?.tiles) ? tilesRow?.tiles : [];
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
