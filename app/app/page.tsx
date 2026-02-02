import React from "react";
import { createSupabaseServer } from "../../lib/supabase/server";
import UploadWizard from "./upload-wizard";

export default async function AppPage() {
  const supabase = createSupabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const userEmail = userData.user?.email ?? "(unbekannt)";

  // Alle DB-Queries explizit im Schema "app"
  const db = supabase.schema("app");

  const { data: workspaces, error: wsErr } = await db
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .order("created_at", { ascending: true });

  const { data: sourceTypes, error: stErr } = await db
    .from("source_types")
    .select("id, code, display_name")
    .order("display_name", { ascending: true });

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Dashboard</h2>
          <small>Angemeldet als: {userEmail}</small>
          {userErr && (
            <div>
              <small style={{ color: "crimson" }}>
                User Fehler: {userErr.message}
              </small>
            </div>
          )}
          {wsErr && (
            <div>
              <small style={{ color: "crimson" }}>
                Workspace Fehler: {wsErr.message}
              </small>
            </div>
          )}
          {stErr && (
            <div>
              <small style={{ color: "crimson" }}>
                SourceTypes Fehler: {stErr.message}
              </small>
            </div>
          )}
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="btn secondary" type="submit">
            Logout
          </button>
        </form>
      </div>

      <div style={{ marginTop: 14 }}>
        <UploadWizard
          workspaces={(workspaces ?? []).map((w: any) => ({
            id: w.workspace_id as string,
            name: w.workspaces?.name ?? (w.workspace_id as string),
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
