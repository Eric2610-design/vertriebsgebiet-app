import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const onlyMaster = body?.onlyMaster === true || body?.onlyMaster === "1";

    const batchId = randomUUID();
    const sb = supabaseServer();

    let update = sb
      .from("dealers")
      .update({
        geocode_batch_id: batchId,
        geocode_status: "queued",
        geocode_provider: "nominatim",
        geocoded_at: new Date().toISOString(),
        geocode_error: null,
      })
      .is("lat", null)
      .is("lng", null);

    if (onlyMaster) {
      update = update.eq("is_master", true).is("duplicate_of", null);
    }

    const { error } = await update;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const countRes = await sb
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_batch_id", batchId);

    return NextResponse.json({ ok: true, batchId, queued: countRes.count ?? 0, onlyMaster });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
