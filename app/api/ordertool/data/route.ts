import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = (url.searchParams.get("market") || "DE_AT").toUpperCase();
  const supabase = supabaseService();

  const keys = [
    "ordertool_stock_tiles",
    "pricing_thresholds",
    "ordertool_max_qty",
  ];

  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .in("key", keys);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const byKey = new Map((data || []).map((row: any) => [row.key, row.value]));
  const stock = byKey.get("ordertool_stock_tiles") || {};
  const thresholds = byKey.get("pricing_thresholds") || {};
  const maxQty = byKey.get("ordertool_max_qty");

  const tiles = market === "CH" ? (stock.tilesCH || []) : (stock.tilesDE || []);

  return NextResponse.json({
    tiles,
    thresholds,
    maxQty: Number.isFinite(Number(maxQty)) ? Number(maxQty) : null,
    updatedAt: stock.updatedAt || null,
  });
}
