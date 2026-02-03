import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function supa() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}

async function requireMember(supabase: any, workspaceId: string, userId: string) {
  const m = await supabase
    .schema("app")
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!m.data;
}

// Toggle enabled/disabled
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = supa();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const workspaceId = (body?.workspaceId ?? "").toString();
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId_missing" }, { status: 400 });

  const okMember = await requireMember(supabase, workspaceId, u.user.id);
  if (!okMember) return NextResponse.json({ ok: false, error: "no_access" }, { status: 403 });

  const patch: any = {};
  if (typeof body?.is_enabled === "boolean") patch.is_enabled = body.is_enabled;

  const up = await supabase
    .schema("app")
    .from("source_types")
    .update(patch)
    .eq("id", ctx.params.id)
    .select("id, code, display_name, is_enabled, deleted_at, created_at")
    .single();

  if (up.error) return NextResponse.json({ ok: false, error: up.error }, { status: 500 });
  return NextResponse.json({ ok: true, source_type: up.data });
}

// Hard delete: remove data + soft-delete source_type
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const supabase = supa();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId_missing" }, { status: 400 });

  const okMember = await requireMember(supabase, workspaceId, u.user.id);
  if (!okMember) return NextResponse.json({ ok: false, error: "no_access" }, { status: 403 });

  // 1) Daten löschen (Records + Links + Orphans …)
  const del = await supabase.rpc("remove_source_type_data", {
    p_workspace_id: workspaceId,
    p_source_type_id: ctx.params.id,
  });

  if (del.error) return NextResponse.json({ ok: false, error: del.error }, { status: 500 });

  // 2) source_type soft-delete + disable
  const up = await supabase
    .schema("app")
    .from("source_types")
    .update({ deleted_at: new Date().toISOString(), is_enabled: false })
    .eq("id", ctx.params.id);

  if (up.error) return NextResponse.json({ ok: false, error: up.error }, { status: 500 });

  return NextResponse.json({ ok: true, result: del.data });
}
