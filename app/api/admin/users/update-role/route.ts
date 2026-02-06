import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/app/api/_auth";
import { supabaseService } from "@/lib/supabase";

const Schema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["superadmin", "admin", "aussendienst"]),
});

export async function POST(req: Request) {
  await requireRole(["superadmin"]);
  const body = Schema.parse(await req.json());
  const supabase = supabaseService();
  const { error } = await supabase.from("profiles").update({ role: body.role }).eq("id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
