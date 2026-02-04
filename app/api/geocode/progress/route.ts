import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/geocode/progress?batchId=...
 * Gibt total/done und Status-Zähler für den Batch zurück.
 */
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

  const ok = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId)
    .eq("geocode_status", "ok");

  const notFound = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId)
    .eq("geocode_status", "not_found");

  const error = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId)
    .eq("geocode_status", "error");

  const queued = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("geocode_batch_id", batchId)
    .eq("geocode_status", "queued");

  return NextResponse.json({
    ok: true,
    batchId,
    total: total.count ?? 0,
    done: done.count ?? 0,
    breakdown: {
      queued: queued.count ?? 0,
      ok: ok.count ?? 0,
      not_found: notFound.count ?? 0,
      error: error.count ?? 0,
    },
  });
}
