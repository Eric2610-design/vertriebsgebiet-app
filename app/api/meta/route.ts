import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAccessTokenFromCookies(): string | null {
  const all = cookies().getAll();

  // 1) klassisch
  const direct = all.find((c) => c.name === "sb-access-token")?.value;
  if (direct) return direct;

  // 2) auth-helpers cookie: sb-<project-ref>-auth-token
  const authCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  )?.value;

  if (!authCookie) return null;

  const tryParse = (raw: string): any | null => {
    try {
      return JSON.parse(raw);
    } catch {}
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {}
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {}
    return null;
  };

  const parsed = tryParse(authCookie);
  if (!parsed) return null;

  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  return obj?.access_token ?? null;
}

function supabaseUserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = getAccessTokenFromCookies();

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export async function GET() {
  try {
    const supabase = supabaseUserClient();

    // Auth check
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { ok: false, error: "Nicht eingeloggt" },
        { status: 401 }
      );
    }

    const user = userRes.user;

    // 1) Memberships holen
    const { data: memberships, error: mErr } = await supabase
      .schema("app")
      .from("workspace_members")
      .select("workspace_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (mErr) {
      return NextResponse.json(
        { ok: false, error: mErr.message },
        { status: 500 }
      );
    }

    const workspaceIds = (memberships ?? []).map((m) => m.workspace_id).filter(Boolean);

    // 2) Workspaces separat holen (kein Join → robust)
    let workspaces: any[] = [];
    if (workspaceIds.length > 0) {
      const { data: wsRows, error: wsErr } = await supabase
        .schema("app")
        .from("workspaces")
        .select("*")
        .in("id", workspaceIds);

      if (wsErr) {
        return NextResponse.json(
          { ok: false, error: wsErr.message },
          { status: 500 }
        );
      }
      workspaces = wsRows ?? [];
    }

    // Membership-Reihenfolge beibehalten
    const wsById = new Map(workspaces.map((w) => [w.id, w]));
    const outWorkspaces = (memberships ?? []).map((m) => {
      const ws = wsById.get(m.workspace_id);
      const name =
        ws?.name ??
        ws?.display_name ??
        ws?.title ??
        ws?.label ??
        ws?.code ??
        m.workspace_id;
      return { id: m.workspace_id, name: String(name) };
    });

    // 3) Source Types (Hersteller) holen
    // Deine Tabelle hat: id, code, display_name, created_at (+ evtl is_enabled/deleted_at später)
    const { data: sourceTypes, error: sErr } = await supabase
      .schema("app")
      .from("source_types")
      .select("*")
      .order("display_name", { ascending: true });

    if (sErr) {
      return NextResponse.json(
        { ok: false, error: sErr.message },
        { status: 500 }
      );
    }

    const outSourceTypes = (sourceTypes ?? []).map((s: any) => ({
      id: s.id,
      code: s.code,
      name: s.display_name,
      is_enabled: s.is_enabled ?? true, // falls Spalte noch nicht existiert → true
      deleted_at: s.deleted_at ?? null,
    }));

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      workspaces: outWorkspaces,
      sourceTypes: outSourceTypes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Unexpected error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
