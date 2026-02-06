import { NextResponse } from "next/server";
import { supabaseAnon, supabaseService } from "@/lib/supabase";
import { setAuthCookies } from "@/app/api/_auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const access_token = String(body?.access_token || "");
  const refresh_token = String(body?.refresh_token || "");
  const next = String(body?.next || "/map");

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "missing_tokens" }, { status: 400 });
  }

  // Validate session and read user
  const supabase = supabaseAnon();
  await supabase.auth.setSession({ access_token, refresh_token });
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return NextResponse.json({ error: "invalid_session" }, { status: 401 });

  // Role from profiles (service role for robustness)
  let role: any = null;
  try {
    const svc = supabaseService();
    const { data: prof } = await svc.from("profiles").select("role").eq("email", user.email.toLowerCase()).maybeSingle();
    role = prof?.role ?? null;
  } catch {
    role = null;
  }

  const res = NextResponse.json({ ok: true, next });
  setAuthCookies(res, { access_token, refresh_token, role, email: user.email });
  return res;
}
