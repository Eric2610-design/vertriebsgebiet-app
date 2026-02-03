import React from "react";
import { createSupabaseServer } from "../../../lib/supabase/server";
import MapClient from "./MapClient";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const supabase = createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Karte</h2>
        <p>Du bist nicht eingeloggt.</p>
        <a className="btn" href="/login">Zum Login</a>
      </div>
    );
  }

  const db = supabase.schema("app");

  const { data: memberships, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .order("created_at", { ascending: true });

  const { data: sourceTypes, error: sErr } = await db
    .from("source_types")
    .select("code, display_name")
    .order("display_name", { ascending: true });

  if (mErr || sErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Karte</h2>
        <p style={{ color: "crimson" }}>
          Fehler beim Laden der Meta-Daten: {(mErr?.message ?? sErr?.message) ?? "unbekannt"}
        </p>
      </div>
    );
  }

  const workspaces =
    (memberships ?? []).map((w: any) => ({
      id: w.workspace_id as string,
      name: w.workspaces?.name ?? w.workspace_id,
    })) ?? [];

  const sources =
    (sourceTypes ?? []).map((s: any) => ({
      code: s.code as string,
      name: s.display_name as string,
    })) ?? [];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Karte</h2>
          <small>PLZ-Filter: 35–36, 53–57, 60–69</small>
        </div>
        <a className="btn secondary" href="/app">Zurück</a>
      </div>

      <div style={{ marginTop: 14 }}>
        <MapClient workspaces={workspaces} sourceTypes={sources} />
      </div>
    </div>
  );
}
