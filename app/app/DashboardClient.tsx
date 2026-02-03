
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Meta = {
  workspaces?: { id: string; name: string }[];
  sourceTypes?: any[];
};

export default function DashboardClient({ meta }: { meta: Meta | null }) {
  const workspaces = meta?.workspaces ?? [];
  const sourceTypes = meta?.sourceTypes ?? [];

  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");

  const sources = useMemo(() => {
    return sourceTypes.map((s: any) => ({
      id: s.id ?? "",
      code: s.code ?? "",
      name: s.display_name ?? s.displayName ?? s.name ?? s.code ?? "",
    }));
  }, [sourceTypes]);

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      {!meta && (
        <p style={{ color: "crimson" }}>
          Fehler: Meta nicht ok (API/Session). Bitte /api/meta prüfen.
        </p>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Link className="btn secondary" href="/app/map">
          Karte
        </Link>
        <Link className="btn secondary" href="/app/upload">
          Upload
        </Link>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Workspace</h3>
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          style={{ minWidth: 280 }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Aktiver Workspace: <b>{workspaceId || "(kein Workspace)"}</b>
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Importierte Hersteller/Quellen</h3>

        {sources.length === 0 ? (
          <p>Keine Quellen vorhanden.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {sources.map((s) => (
              <li key={s.code || s.id}>
                <b>{s.name}</b>{" "}
                <span style={{ opacity: 0.7 }}>({s.code || s.id})</span>
              </li>
            ))}
          </ul>
        )}

        <p style={{ marginTop: 12, opacity: 0.8 }}>
          Entfernen bauen wir als nächstes über deine SQL-Funktion{" "}
          <code>public.remove_source_type_data()</code> + API Button.
        </p>
      </div>
    </div>
  );
}
