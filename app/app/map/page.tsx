import React from "react";
import { createSupabaseServer } from "../../../lib/supabase/server";
import MapClient from "./MapClient";

export default async function MapPage() {
  const supabase = createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  const db = supabase.schema("app");

  const { data: workspaces } = await db
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .order("created_at", { ascending: true });

  const { data: sourceTypes } = await db
    .from("source_types")
    .select("code, display_name")
    .order("display_name", { ascending: true });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Karte</h2>
          <small>Angemeldet als: {userData.user?.email}</small>
        </div>

        <a className="btn secondary" href="/app">Zurück</a>
      </div>

      <div style={{ marginTop: 14 }}>
        <MapClient
          workspaces={(workspaces ?? []).map((w: any) => ({
            id: w.workspace_id as string,
            name: w.workspaces?.name ?? w.workspace_id,
          }))}
          sourceTypes={(sourceTypes ?? []).map((s: any) => ({
            code: s.code as string,
            name: s.display_name as string,
          }))}
        />
      </div>
    </div>
  );
}
