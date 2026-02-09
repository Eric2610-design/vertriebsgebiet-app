import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseService } from "@/lib/supabase";

function normMarket(value: string | null) {
  return value === "CH" ? "CH" : "DE_AT";
}

function normQuery(value: string | null) {
  return String(value || "").trim();
}

async function requireAuthed() {
  const c = await cookies();
  const authed = c.get("vt_authed")?.value === "1";
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const authErr = await requireAuthed();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const market = normMarket(searchParams.get("market"));
  const q = normQuery(searchParams.get("q"));
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 1000);

  const supabase = supabaseService();
  const runRes = await supabase.from("stock_runs").select("id").order("created_at", { ascending: false }).limit(1).single();
  if (runRes.error || !runRes.data) {
    return NextResponse.json({ items: [] });
  }

  let query = supabase
    .from("stock_items")
    .select(
      "id,sku,name,model_year,series,model,color,frame_size,frame_type,battery,motor_type,motor_brand,price_eur,price_chf,avail_now,avail_total,availability_plan"
    )
    .eq("run_id", runRes.data.id)
    .limit(limit);

  if (market === "CH") {
    query = query.gt("price_chf", 0);
  } else {
    query = query.gt("price_eur", 0);
  }

  if (q) {
    const safe = q.replace(/[%_]/g, "\\$&");
    query = query.or(`sku.ilike.%${safe}%,name.ilike.%${safe}%,model.ilike.%${safe}%,series.ilike.%${safe}%`);
  }

  const itemsRes = await query;
  if (itemsRes.error) {
    return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ items: itemsRes.data ?? [] });
}
