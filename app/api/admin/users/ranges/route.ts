import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/app/api/_auth";
import { supabaseService } from "@/lib/supabase";

const GetSchema = z.object({ user_id: z.string().uuid() });
const SetSchema = z.object({
  user_id: z.string().uuid(),
  ranges: z
    .array(
      z.object({
        country: z.enum(["DE", "AT"]),
        plz_from: z.number().int().min(0).max(99999),
        plz_to: z.number().int().min(0).max(99999),
      })
    )
    .default([]),
});

export async function GET(req: Request) {
  await requireRole(["superadmin"]);
  const url = new URL(req.url);
  const user_id = String(url.searchParams.get("user_id") || "");
  const p = GetSchema.parse({ user_id });
  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("ad_plz_ranges")
    .select("id,country,plz_from,plz_to")
    .eq("user_id", p.user_id)
    .order("country", { ascending: true })
    .order("plz_from", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  await requireRole(["superadmin"]);
  const body = SetSchema.parse(await req.json());
  const supabase = supabaseService();

  // Replace all ranges for user
  const { error: delErr } = await supabase.from("ad_plz_ranges").delete().eq("user_id", body.user_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (body.ranges.length) {
    const rows = body.ranges.map((r) => ({ user_id: body.user_id, ...r }));
    const { error: insErr } = await supabase.from("ad_plz_ranges").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
