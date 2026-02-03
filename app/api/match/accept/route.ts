import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";

const BodySchema = z.object({ candidateId: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { candidateId } = BodySchema.parse(await req.json());

    const admin = createSupabaseAdmin();
    const adb = admin.schema("app"); // <<< WICHTIG

    const { data: cand, error: cErr } = await adb
      .from("match_candidates")
      .select("id, workspace_id, left_source_record_id, right_source_record_id, status")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!cand) return NextResponse.json({ error: "Candidate nicht gefunden." }, { status: 404 });

    const { data: mem, error: mErr } = await adb
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", cand.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    if (cand.status !== "suggested") {
      return NextResponse.json({ error: "Candidate ist nicht mehr suggested." }, { status: 400 });
    }

    const { data: srLeft, error: lErr } = await adb
      .from("source_records")
      .select("id, workspace_id, name, street, zipcode, city, phone, email, website")
      .eq("id", cand.left_source_record_id)
      .maybeSingle();
    if (lErr) throw lErr;

    const { data: srRight, error: rErr } = await adb
      .from("source_records")
      .select("id, workspace_id, name, street, zipcode, city, phone, email, website")
      .eq("id", cand.right_source_record_id)
      .maybeSingle();
    if (rErr) throw rErr;

    if (!srLeft || !srRight) return NextResponse.json({ error: "SourceRecords fehlen." }, { status: 400 });

    const { data: linkLeft } = await adb.from("source_links").select("dealer_id").eq("source_record_id", srLeft.id).maybeSingle();
    const { data: linkRight } = await adb.from("source_links").select("dealer_id").eq("source_record_id", srRight.id).maybeSingle();

    let dealerId = linkLeft?.dealer_id ?? linkRight?.dealer_id ?? null;

    if (!dealerId) {
      const { data: dealer, error: dErr } = await adb
        .from("dealers")
        .insert({
          workspace_id: srLeft.workspace_id,
          canonical_name: srLeft.name ?? srRight.name ?? "Unbekannt",
          notes: "Auto-erstellt via Match-Accept",
        })
        .select("id")
        .single();
      if (dErr) throw dErr;
      dealerId = dealer.id;

      const loc = await adb.from("dealer_locations").insert({
        workspace_id: srLeft.workspace_id,
        dealer_id: dealerId,
        label: "Hauptadresse",
        street: srLeft.street,
        zipcode: srLeft.zipcode,
        city: srLeft.city,
        country: "DE",
        phone: srLeft.phone,
        email: srLeft.email,
        website: srLeft.website,
        is_primary: true,
      });
      if (loc.error) throw loc.error;
    }

    const linkPayload = (sr: any) => ({
      source_record_id: sr.id,
      dealer_id: dealerId,
      link_type: "manual",
      confidence: 0.9,
      reasons: { from: "match_candidate_accept", candidate_id: cand.id },
      created_by: userData.user!.id,
    });

    const u1 = await adb.from("source_links").upsert(linkPayload(srLeft), { onConflict: "source_record_id" });
    if (u1.error) throw u1.error;

    const u2 = await adb.from("source_links").upsert(linkPayload(srRight), { onConflict: "source_record_id" });
    if (u2.error) throw u2.error;

    const u3 = await adb.from("match_candidates").update({ status: "accepted" }).eq("id", cand.id);
    if (u3.error) throw u3.error;

    return NextResponse.json({ ok: true, dealerId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Accept failed" }, { status: 500 });
  }
}
