import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/app/api/_auth";
import { supabaseService } from "@/lib/supabase";

const Schema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1),
  role: z.enum(["admin", "aussendienst"]),
});

export async function POST(req: Request) {
  await requireRole(["superadmin"]);
  const body = Schema.parse(await req.json());
  const supabase = supabaseService();

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://vertriebsgebiet-app.vercel.app";
  const redirectTo = `${base}/callback`;

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(body.email, { redirectTo });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userId = data?.user?.id;
  if (!userId) return NextResponse.json({ error: "invite_failed" }, { status: 500 });

  // create / update profile
  const { error: upErr } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, email: body.email.toLowerCase(), display_name: body.display_name, role: body.role },
      { onConflict: "id" }
    );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, user_id: userId });
}
