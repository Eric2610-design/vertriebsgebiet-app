import { NextResponse } from "next/server";
import { supabaseAnon, supabaseService } from "@/lib/supabase";
import { setAuthCookies } from "@/app/api/_auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const next = String(body?.next || "/map");

  if (!email || !password) {
    return NextResponse.json({ error: "E-Mail und Passwort erforderlich" }, { status: 400 });
  }

  const supabase = supabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return NextResponse.json({ error: error?.message || "Login fehlgeschlagen" }, { status: 401 });
  }

  const access_token = data.session.access_token;
  const refresh_token = data.session.refresh_token;

  // Role aus profiles ziehen (robust via service role) – du hast profiles RLS, aber so ist es stabil.
  let role: any = null;
  try {
    const svc = supabaseService();
    const { data: prof } = await svc.from("profiles").select("role").eq("email", email).maybeSingle();
    role = prof?.role ?? null;
  } catch {
    role = null;
  }

  const res = NextResponse.json({ ok: true, next });
  setAuthCookies(res, { access_token, refresh_token, role, email });
  return res;
}
