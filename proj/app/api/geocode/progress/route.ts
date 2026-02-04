import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    if (!batchId) {
      return NextResponse.json({ ok: false, error: "batchId missing" }, { status: 400 });
    }

    const sb = supabaseServer();

    const total = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId);

    const done = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId)
      .in("geocode_status", ["ok", "not_found", "error"]);

    const ok = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId)
      .eq("geocode_status", "ok");

    const notFound = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId)
      .eq("geocode_status", "not_found");

    const error = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId)
      .eq("geocode_status", "error");

    const queued = await sb
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
