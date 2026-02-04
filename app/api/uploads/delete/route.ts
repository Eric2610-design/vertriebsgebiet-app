import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "id missing" }, { status: 400 });
    }

    const sb = supabaseServer();

    // Delete only dealers that were newly inserted in this run
    const delDealers = await sb.from("dealers").delete({ count: "exact" }).eq("upload_run_id", id);
    if (delDealers.error) {
      return NextResponse.json({ ok: false, error: delDealers.error.message }, { status: 400 });
    }

    // Best-effort: delete source-run links for this run (if the table exists)
    await sb.from("dealer_source_runs").delete().eq("upload_run_id", id);

    const delRun = await sb.from("upload_runs").delete().eq("id", id);
    if (delRun.error) {
      return NextResponse.json({ ok: false, error: delRun.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, dealers_deleted: delDealers.count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
