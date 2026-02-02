import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

const BodySchema = z.object({ candidateId: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { candidateId } = BodySchema.parse(await req.json());
    const admin = createSupabaseAdmin();

    const { data: cand, error: cErr } = await admin
      .from("match_candidates")
      .select("id, workspace_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr || !cand) return NextResponse.json({ error: "Candidate nicht gefunden." }, { status: 404 });

    const { data: mem } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", cand.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    await admin.from("match_candidates").update({ status: "rejected" }).eq("id", cand.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Reject failed" }, { status: 500 });
  }
}
