import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

export async function GET() {
  try {
    const supabase = createSupabaseServer();

    // 1) Auth prüfen
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) {
      return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "Nicht eingeloggt." }, { status: 401 });
    }

    // 2) Memberships holen (ohne Join!)
    const db = supabase.schema("app");

    const { data: memberships, error: mErr } = await db
      .from("workspace_members")
      .select("workspace_id, created_at")
      .order("created_at", { ascending: true });

    if (mErr) {
      return NextResponse.json({ ok: false, error: mErr.message, where: "workspace_members" }, { status: 500 });
    }

    const workspaceIds = (memberships ?? [])
      .map((m: any) => m.workspace_id)
      .filter(Boolean);

    // 3) Workspaces separat holen
    let workspaces: Array<{ id: string; name: string }> = [];
    if (workspaceIds.length > 0) {
      // Achtung: je nach Tabelle heißt es name oder display_name
      // Wir versuchen beides "vorsichtig".
      const { data: ws1, error: wsErr1 } = await db
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);

      if (!wsErr1 && ws1) {
        workspaces = ws1.map((w: any) => ({
          id: w.id,
          name: w.name ?? String(w.id),
        }));
      } else {
        // Fallback: display_name
        const { data: ws2, error: wsErr2 } = await db
          .from("workspaces")
          .select("id, display_name")
          .in("id", workspaceIds);

        if (wsErr2) {
          return NextResponse.json(
            { ok: false, error: wsErr2.message, where: "workspaces" },
            { status: 500 }
          );
        }

        workspaces = (ws2 ?? []).map((w: any) => ({
          id: w.id,
          name: w.display_name ?? String(w.id),
        }));
      }
    }

    // 4) Source Types holen (hier ist es bei dir: code + display_name)
    const { data: sourceTypes, error: sErr } = await db
      .from("source_types")
      .select("id, code, display_name, is_enabled, deleted_at")
      .order("display_name", { ascending: true });

    if (sErr) {
      // falls is_enabled/deleted_at noch nicht existiert, trotzdem nicht crashen:
      const { data: sourceTypesFallback, error: sErr2 } = await db
        .from("source_types")
        .select("id, code, display_name")
        .order("display_name", { ascending: true });

      if (sErr2) {
        return NextResponse.json({ ok: false, error: sErr2.message, where: "source_types" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        workspaces,
        sourceTypes: (sourceTypesFallback ?? []).map((s: any) => ({
          id: s.id,
          code: s.code,
          name: s.display_name,
          is_enabled: true,
          deleted_at: null,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      workspaces,
      sourceTypes: (sourceTypes ?? []).map((s: any) => ({
        id: s.id,
        code: s.code,
        name: s.display_name,
        is_enabled: s.is_enabled ?? true,
        deleted_at: s.deleted_at ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error", where: "meta-route-catch" },
      { status: 500 }
    );
  }
}

