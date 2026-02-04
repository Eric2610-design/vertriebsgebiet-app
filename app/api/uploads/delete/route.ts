import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);

  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "id missing" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Count current dealers for this run
  const before = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .eq("upload_run_id", id);

  // Delete dealers
  const delDealers = await supabase.from("dealers").delete().eq("upload_run_id", id);
  if (delDealers.error) {
    return NextResponse.json({ ok: false, error: delDealers.error.message }, { status: 400 });
  }

  // Delete run record
  const delRun = await supabase.from("upload_runs").delete().eq("id", id);
  if (delRun.error) {
    return NextResponse.json({ ok: false, error: delRun.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    dealers_deleted: before.count ?? 0,
    run_deleted: id,
  });
}
