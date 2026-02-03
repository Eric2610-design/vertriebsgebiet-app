import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../../lib/supabase/admin";

async function getUserOr401() {
  const supabase = createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { user: null, res: NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 }) };
  return { user: data.user, res: null };
}

async function assertAccessAndGetWorkspace(dealerId: string, userId: string) {
  const admin = createSupabaseAdmin();
  const db = admin.schema("app");

  const { data: dealer, error: dErr } = await db.from("dealers").select("*").eq("id", dealerId).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!dealer) return { ok: false as const, status: 404 as const, message: "Händler nicht gefunden." };

  const workspaceId = (dealer as any).workspace_id as string | undefined;
  if (!workspaceId) return { ok: false as const, status: 500 as const, message: "dealer.workspace_id fehlt." };

  const { data: mem, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!mem) return { ok: false as const, status: 403 as const, message: "Kein Zugriff auf Workspace." };

  return { ok: true as const, workspaceId, dealer };
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const dealerId = ctx.params.id;
    const { user, res } = await getUserOr401();
    if (res) return res;

    const access = await assertAccessAndGetWorkspace(dealerId, user!.id);
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const admin = createSupabaseAdmin();
    const db = admin.schema("app");

    const { data: notes, error } = await db
      .from("dealer_notes")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({ notes: notes ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Notes GET failed" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const dealerId = ctx.params.id;
    const { user, res } = await getUserOr401();
    if (res) return res;

    const body = await req.json().catch(() => ({}));
    const note_type = (body.note_type ?? "note").toString();
    const note = (body.note ?? "").toString().trim();
    const title = (body.title ?? "").toString().trim() || null;
    const occurred_at = (body.occurred_at ?? null) as string | null;

    if (!note) return NextResponse.json({ error: "Notiztext fehlt." }, { status: 400 });

    const access = await assertAccessAndGetWorkspace(dealerId, user!.id);
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const admin = createSupabaseAdmin();
    const db = admin.schema("app");

    const { data: inserted, error } = await db
      .from("dealer_notes")
      .insert({
        workspace_id: access.workspaceId,
        dealer_id: dealerId,
        created_by: user!.id,
        note_type,
        occurred_at,
        title,
        note,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ note: inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Notes POST failed" }, { status: 500 });
  }
}
