import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const db = supabase.schema("app");

  const { data: memberships, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .order("created_at", { ascending: true });

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { data: sourceTypes, error: sErr } = await db
    .from("source_types")
    .select("code, display_name")
    .order("display_name", { ascending: true });

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({
    workspaces: (memberships ?? []).map((w: any) => ({
      id: w.workspace_id as string,
      name: w.workspaces?.name ?? w.workspace_id,
    })),
    sourceTypes: (sourceTypes ?? []).map((s: any) => ({ code: s.code, name: s.display_name })),
  });
}
