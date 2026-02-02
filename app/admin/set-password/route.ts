import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { token, userId, newPassword } = await req.json();

    if (!token || token !== process.env.ADMIN_SETUP_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!userId || !newPassword || String(newPassword).length < 10) {
      return NextResponse.json(
        { error: "userId und newPassword (min 10 Zeichen) erforderlich" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      must("NEXT_PUBLIC_SUPABASE_URL"),
      must("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
