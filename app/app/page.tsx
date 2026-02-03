export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "../../lib/supabase/server";

type Props = {
  searchParams?: { workspace?: string };
};

export default async function AppPage({ searchParams }: Props) {
  // Supabase Basis-Client (hat auth)
  let supabase;
  try {
    supabase = createSupabaseServer();
  } catch (e: any) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>
          Supabase Init Fehler: {e?.message ?? String(e)}
        </p>
      </div>
    );
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>auth.getUser Fehler: {userErr.message}</p>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent("/app" + (searchParams?.workspace ? `?workspace=${searchParams.workspace}` : ""));
    redirect(`/login?next=${next}`);
  }

  // DB Client im Schema app (hat KEIN auth)
  const db = supabase.schema("app");

  // 1) memberships -> workspace_ids
  const { data: memberships, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true });

  if (mErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>workspace_members Fehler: {mErr.message}</p>
      </div>
    );
  }

  const workspaceIds = (memberships ?? []).map((x: any) => x.workspace_id).filter(Boolean) as string[];

  // 2) workspaces (Namen) nachladen
  let workspaces: { id: string; name: string }[] = [];
  if (workspaceIds.length > 0) {
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);

    if (wsErr) {
      return (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Dashboard</h2>
          <p style={{ color: "crimson" }}>workspaces Fehler: {wsErr.message}</p>
        </div>
      );
    }

    workspaces =
      (ws ?? []).map((w: any) => ({
        id: w.id as string,
        name: w.name ?? (w.id as string),
      })) ?? [];
  }

  const selectedWorkspaceId =
    (searchParams?.workspace && workspaces.find((w) => w.id === searchParams.workspace)?.id) ||
    workspaces[0]?.id ||
    "";

  // 3) source_types laden (mit Fallback, falls is_enabled noch nicht existiert)
  let sourceTypes: any[] = [];
  let sourceTypesErr: any = null;

  {
    const res = await db
      .from("source_types")
      .select("id, code, display_name, is_enabled")
      .order("display_name", { ascending: true });

    sourceTypes = res.data ?? [];
    sourceTypesErr = res.error;

    if (sourceTypesErr && String(sourceTypesErr.message || "").toLowerCase().includes("is_enabled")) {
      const res2 = await db
        .from("source_types")
        .select("id, code, display_name")
        .order("display_name", { ascending: true });
      sourceTypes = res2.data ?? [];
      sourceTypesErr = res2.error;
    }
  }

  if (sourceTypesErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: "crimson" }}>source_types Fehler: {sourceTypesErr.message}</p>
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
          <Link className="btn secondary" href={selectedWorkspaceId ? `/app/map?workspace=${selectedWorkspaceId}` : "/app/map"}>
            Karte
          </Link>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Workspaces</div>

          {workspaces.length === 0 ? (
            <div style={{ color: "crimson" }}>Kein Workspace gefunden.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {workspaces.map((w) => (
                <Link
                  key={w.id}
                  className="btn secondary"
                  href={`/app?workspace=${w.id}`}
                  style={{
                    border: selectedWorkspaceId === w.id ? "2px solid #111" : undefined,
                  }}
                >
                  {w.name}
                </Link>
              ))}
            </div>
          )}

          {selectedWorkspaceId ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>Aktiv: {selectedWorkspaceId}</div>
          ) : null}
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Hersteller / Quellen</div>

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
                  {"is_enabled" in s ? (s.is_enabled === false ? "deaktiviert" : "aktiv") : "aktiv"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Entfernen pro Hersteller bauen wir als nächstes über <code>remove_source_type_data</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
