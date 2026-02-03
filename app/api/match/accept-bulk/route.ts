import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";

const BodySchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1),
});

async function acceptOne(adb: any, userId: string, candidateId: string) {
  // Candidate laden
  const { data: cand, error: cErr } = await adb
    .from("match_candidates")
    .select("id, workspace_id, left_source_record_id, right_source_record_id, status")
    .eq("id", candidateId)
    .maybeSingle();

  if (cErr) return { id: candidateId, ok: false, error: cErr.message };
  if (!cand) return { id: candidateId, ok: false, error: "Candidate nicht gefunden" };

  // Nur suggested akzeptieren
  if (cand.status !== "suggested") return { id: candidateId, ok: false, error: `Status ist ${cand.status}` };

  // Membership check
  const { data: mem, error: mErr } = await adb
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", cand.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (mErr) return { id: candidateId, ok: false, error: mErr.message };
  if (!mem) return { id: candidateId, ok: false, error: "Kein Zugriff auf Workspace" };

  // Source Records laden
  const { data: srLeft, error: lErr } = await adb
    .from("source_records")
    .select("id, workspace_id, name, street, zipcode, city, phone, email, website")
    .eq("id", cand.left_source_record_id)
    .maybeSingle();
  if (lErr) return { id: candidateId, ok: false, error: lErr.message };

  const { data: srRight, error: rErr } = await adb
    .from("source_records")
    .select("id, workspace_id, name, street, zipcode, city, phone, email, website")
    .eq("id", cand.right_source_record_id)
    .maybeSingle();
  if (rErr) return { id: candidateId, ok: false, error: rErr.message };

  if (!srLeft || !srRight) return { id: candidateId, ok: false, error: "SourceRecords fehlen" };

  // Bestehende Links prüfen
  const { data: linkLeft, error: llErr } = await adb
    .from("source_links")
    .select("dealer_id")
    .eq("source_record_id", srLeft.id)
    .maybeSingle();
  if (llErr) return { id: candidateId, ok: false, error: llErr.message };

  const { data: linkRight, error: lrErr } = await adb
    .from("source_links")
    .select("dealer_id")
    .eq("source_record_id", srRight.id)
    .maybeSingle();
  if (lrErr) return { id: candidateId, ok: false, error: lrErr.message };

  let dealerId = linkLeft?.dealer_id ?? linkRight?.dealer_id ?? null;

  // Dealer anlegen, wenn noch keiner existiert
  if (!dealerId) {
    const { data: dealer, error: dErr } = await adb
      .from("dealers")
      .insert({
        workspace_id: srLeft.workspace_id,
        canonical_name: srLeft.name ?? srRight.name ?? "Unbekannt",
        notes: "Auto-erstellt via Bulk-Merge",
      })
      .select("id")
      .single();
    if (dErr) return { id: candidateId, ok: false, error: dErr.message };
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
    if (loc.error) return { id: candidateId, ok: false, error: loc.error.message };
  }

  // Links upserten
  const linkPayload = (sr: any) => ({
    source_record_id: sr.id,
    dealer_id: dealerId,
    link_type: "manual",
    confidence: 0.9,
    reasons: { from: "match_candidate_accept_bulk", candidate_id: cand.id },
    created_by: userId,
  });

  const u1 = await adb.from("source_links").upsert(linkPayload(srLeft), { onConflict: "source_record_id" });
  if (u1.error) return { id: candidateId, ok: false, error: u1.error.message };

  const u2 = await adb.from("source_links").upsert(linkPayload(srRight), { onConflict: "source_record_id" });
  if (u2.error) return { id: candidateId, ok: false, error: u2.error.message };

  // Candidate als accepted markieren
  const u3 = await adb.from("match_candidates").update({ status: "accepted" }).eq("id", cand.id);
  if (u3.error) return { id: candidateId, ok: false, error: u3.error.message };

  return { id: candidateId, ok: true, dealerId };
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { candidateIds } = BodySchema.parse(await req.json());

    const admin = createSupabaseAdmin();
    const adb = admin.schema("app");

    const results: any[] = [];
    for (const id of candidateIds) {
      // sequenziell = stabiler (keine DB-Spikes)
      // wenn du später willst, machen wir parallel mit Limit.
      const r = await acceptOne(adb, userData.user.id, id);
      results.push(r);
    }

    const accepted = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({ ok: true, accepted, failed, results });
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : e?.message ?? "Bulk accept failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
