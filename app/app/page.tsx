export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "../../lib/supabase/server";

type Props = {
  searchParams?: { workspace?: string };
};

export default async function AppPage({ searchParams }: Props) {
  // 1) Supabase "Basis"-Client (hat auth!)
  const supabase = createSupabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Wenn nicht eingeloggt → Login
  if (!user) {
    const next = encodeURIComponent("/app" + (searchParams?.workspace ? `?workspace=${searchParams.workspace}` : ""));
    redirect(`/login?next=${next}`);
  }

  // 2) DB Client im Schema "app" (hat KEIN auth)
  const db = supabase.schema("app");

  // Workspaces des Users
  const { data: memberships, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .order("created_at", { ascending: true });

  if (mErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>Fehler: workspace_members: {mErr.message}</p>
      </div>
    );
  }

  const workspaces =
    (memberships ?? []).map((w: any) => ({
      id: w.workspace_id as string,
      name: w.workspaces?.name ?? (w.workspace_id as string),
    })) ?? [];

  const workspaceId =
    (searchParams?.workspace && workspaces.find((w) => w.id === searchParams.workspace)?.id) ||
    workspaces[0]?.id ||
    "";

  // Hersteller/Quellen
  const { data: sourceTypes, error: sErr } = await db
    .from("source_types")
    .select("id, code, display_name, is_enabled")
    .order("display_name", { ascending: true });

  if (sErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>Fehler: source_types: {sErr.message}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Dashboard</h2>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Angemeldet als: {user.email}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn secondary" href={`/app/map${workspaceId ? `?workspace=${workspaceId}` : ""}`}>
            Karte
          </Link>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Workspace</div>
          <form method="GET" action="/app" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              name="workspace"
              defaultValue={workspaceId}
              onChange={(e) => (e.currentTarget.form as HTMLFormElement)?.requestSubmit()}
              style={{ minWidth: 260 }}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {workspaceId ? `ID: ${workspaceId}` : "Kein Workspace gefunden"}
            </div>
          </form>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Importierte Hersteller / Quellen</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(sourceTypes ?? []).map((s: any) => (
              <div
                key={s.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{s.display_name ?? s.code}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Code: {s.code}</div>
                </div>

                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  {s.is_enabled === false ? "deaktiviert" : "aktiv"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Entfernen/Reset pro Hersteller bauen wir als nächstes über deine SQL-Funktion <code>remove_source_type_data</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
