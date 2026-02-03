// app/api/meta/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServer();

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr || !user) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  const db = supabase.schema("app");

  const { data: memberships, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const workspaceIds = (memberships ?? []).map((m: any) => m.workspace_id);

  const { data: workspaces, error: wErr } = await db
    .from("workspaces")
    .select("id, name")
    .in("id", workspaceIds);

  if (wErr) {
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  const { data: sourceTypes, error: sErr } = await db
    .from("source_types")
    .select("id, code, display_name, is_enabled")
    .order("display_name", { ascending: true });

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  return NextResponse.json({
    workspaces: (workspaces ?? []).map((w: any) => ({ id: w.id, name: w.name })),
    sourceTypes: (sourceTypes ?? []).map((s: any) => ({
      id: s.id,
      code: s.code,
      name: s.display_name,
      is_enabled: s.is_enabled ?? true,
    })),
  });
}
