import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseService } from "@/lib/supabase";

type AttributeMap = Record<string, string[]>;

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

export async function GET() {
  const authErr = await requireAuthed();
  if (authErr) return authErr;

  const supabase = supabaseService();
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ordertool_attribute_rules_v1")
    .maybeSingle();

  const { data: tiles, error } = await supabase
    .from("ordertool_stock_tiles")
    .select("motor,preisart,frame,battery_tags,battery_min,battery_max,battery_note,rows")
    .limit(2000);

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

  if (!error && Array.isArray(tiles)) {
    const motors = new Set<string>();
    const statuses = new Set<string>();
    const batteries = new Set<string>();
    const frames = new Set<string>();
    const colors = new Set<string>();
    const sizes = new Set<string>();
    const preisarten = new Set<string>();

    for (const tile of tiles) {
      if (tile?.motor) motors.add(String(tile.motor));
      if (tile?.frame) frames.add(String(tile.frame));
      if (tile?.preisart) preisarten.add(String(tile.preisart));
      if (Array.isArray(tile?.battery_tags)) {
        for (const tag of tile.battery_tags) {
          if (tag) batteries.add(String(tag));
        }
      }
      const battery = batteryLabel(tile);
      if (battery) batteries.add(battery);
      if (Array.isArray(tile?.rows)) {
        for (const row of tile.rows) {
          if (row?.status) statuses.add(String(row.status));
          if (row?.color) colors.add(String(row.color));
          if (row?.size) sizes.add(String(row.size));
        }
      }
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
