import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");

  if (!batchId) {
    return NextResponse.json({ ok: false, error: "batchId missing" }, { status: 400 });
  }

  const total = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId);

  const done = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId)
    .in("geocode_status", ["ok", "not_found", "error"]);

  return NextResponse.json({
    ok: true,
    total: total.count ?? 0,
    done: done.count ?? 0,
  });
}
