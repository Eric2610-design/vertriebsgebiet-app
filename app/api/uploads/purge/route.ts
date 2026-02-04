import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * POST /api/uploads/purge
 * body: { mode: "dealers" | "all" | "untracked" }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode ?? "dealers");

  const supabase = supabaseServer();

  const countAllDealers = async () =>
    supabase.from("dealers").select("id", { count: "exact", head: true });

  const countAllRuns = async () =>
    supabase.from("upload_runs").select("id", { count: "exact", head: true });

  if (mode === "untracked") {
    const before = await supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .is("upload_run_id", null);

    const del = await supabase.from("dealers").delete().is("upload_run_id", null);
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });

    return NextResponse.json({ ok: true, mode, dealers_deleted: before.count ?? 0 });
  }

  if (mode === "all") {
    const dealersBefore = await countAllDealers();
    const runsBefore = await countAllRuns();

    const delDealers = await supabase.from("dealers").delete().neq("id", -1);
    if (delDealers.error) return NextResponse.json({ ok: false, error: delDealers.error.message }, { status: 400 });

    const delRuns = await supabase.from("upload_runs").delete().neq("id", -1);
    if (delRuns.error) return NextResponse.json({ ok: false, error: delRuns.error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      mode,
      dealers_deleted: dealersBefore.count ?? 0,
      runs_deleted: runsBefore.count ?? 0,
    });
  }

  // default: only dealers
  const dealersBefore = await countAllDealers();
  const delDealers = await supabase.from("dealers").delete().neq("id", -1);
  if (delDealers.error) return NextResponse.json({ ok: false, error: delDealers.error.message }, { status: 400 });

  return NextResponse.json({ ok: true, mode: "dealers", dealers_deleted: dealersBefore.count ?? 0 });
}
