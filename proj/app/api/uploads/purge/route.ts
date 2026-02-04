import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "");

    if (!mode || !["dealers", "all", "untracked"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "mode must be dealers|all|untracked" }, { status: 400 });
    }

    const sb = supabaseServer();

    if (mode === "untracked") {
      const del = await sb.from("dealers").delete({ count: "exact" }).is("upload_run_id", null);
      if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });
      return NextResponse.json({ ok: true, dealers_deleted: del.count ?? 0 });
    }

    // delete all dealers
    const delDealers = await sb.from("dealers").delete({ count: "exact" }).neq("id", 0);
    if (delDealers.error) return NextResponse.json({ ok: false, error: delDealers.error.message }, { status: 400 });

    if (mode === "dealers") {
      return NextResponse.json({ ok: true, dealers_deleted: delDealers.count ?? 0 });
    }

    // mode === "all": also delete upload_runs (and any linking tables)
    await sb.from("dealer_source_runs").delete().neq("dealer_id", 0);

    const delRuns = await sb.from("upload_runs").delete({ count: "exact" }).neq("id", 0);
    if (delRuns.error) return NextResponse.json({ ok: false, error: delRuns.error.message }, { status: 400 });

    return NextResponse.json({ ok: true, dealers_deleted: delDealers.count ?? 0, runs_deleted: delRuns.count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
