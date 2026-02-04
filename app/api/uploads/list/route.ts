import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 5000);

    const sb = supabaseServer();

    // Prefer view (contains current dealers counts). Fallback to table if view missing.
    const { data: viewRows, error: viewErr } = await sb
      .from("upload_runs_summary")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!viewErr) {
      return NextResponse.json({ ok: true, runs: viewRows ?? [] });
    }

    const { data, error } = await sb
      .from("upload_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, runs: data ?? [], note: "upload_runs_summary view missing" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
