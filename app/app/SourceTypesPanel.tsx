"use client";

import React, { useEffect, useMemo, useState } from "react";

type SourceType = {
  id: string;
  code: string | null;
  display_name: string | null;
  is_enabled: boolean;
  deleted_at: string | null;
  created_at: string | null;
  stats?: { records: number; dealers: number };
};

export default function SourceTypesPanel({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<SourceType[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newDisplayName, setNewDisplayName] = useState("");
  const [newCode, setNewCode] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/source-types?workspaceId=${encodeURIComponent(workspaceId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || "Fehler beim Laden");
      setItems(data.source_types || []);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    const display_name = newDisplayName.trim();
    if (!display_name) return;

    setBusyId("create");
    setErr("");
    try {
      const res = await fetch(`/api/source-types`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, display_name, code: newCode.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || "Fehler beim Anlegen");
      setNewDisplayName("");
      setNewCode("");
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(id: string, next: boolean) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/source-types/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, is_enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || "Fehler beim Speichern");
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function hardDelete(id: string, label: string) {
    const ok = confirm(
      `⚠️ Hart löschen?\n\n${label}\n\nDas entfernt die Importdaten (Source-Records, Links, Vorschläge) dieser Quelle aus dem Workspace. Händler werden nur gelöscht, wenn sie danach keine Quelle mehr haben.`
    );
    if (!ok) return;

    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(
        `/api/source-types/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || "Fehler beim Löschen");
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const sorted = useMemo(() => {
    return (items || []).slice().sort((a, b) => (b.stats?.records ?? 0) - (a.stats?.records ?? 0));
  }, [items]);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Hersteller / Quellen</h2>
          <small style={{ opacity: 0.8 }}>
            Deaktivieren = nur ausblenden. Hart löschen = Importdaten entfernen.
          </small>
        </div>
        <button className="btn secondary" onClick={load} disabled={loading}>
          Aktualisieren
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 10, color: "#b00020", whiteSpace: "pre-wrap" }}>
          <b>Fehler:</b> {err}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Neuen Hersteller anlegen</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Display Name (z.B. Riese & Müller)"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            style={{ minWidth: 260, flex: 1 }}
          />
          <input
            className="input"
            placeholder="Code (optional, z.B. rm)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ width: 180 }}
          />
          <button className="btn" onClick={create} disabled={busyId === "create" || !newDisplayName.trim()}>
            {busyId === "create" ? "…" : "Anlegen"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Lade…</p>
        ) : sorted.length === 0 ? (
          <p style={{ opacity: 0.8 }}>Noch keine Hersteller/Quellen vorhanden.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <th style={{ padding: "8px 6px" }}>Hersteller</th>
                  <th style={{ padding: "8px 6px" }}>Records</th>
                  <th style={{ padding: "8px 6px" }}>Händler</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const label = s.display_name || s.code || s.id;
                  const records = s.stats?.records ?? 0;
                  const dealers = s.stats?.dealers ?? 0;

                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <td style={{ padding: "10px 6px" }}>
                        <div style={{ fontWeight: 700 }}>{s.display_name ?? "(ohne Name)"}</div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>{s.code ?? s.id}</div>
                      </td>
                      <td style={{ padding: "10px 6px" }}>{records}</td>
                      <td style={{ padding: "10px 6px" }}>{dealers}</td>
                      <td style={{ padding: "10px 6px" }}>
                        {s.is_enabled ? <b>aktiv</b> : <span style={{ opacity: 0.75 }}>deaktiviert</span>}
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            className="btn secondary"
                            onClick={() => toggle(s.id, !s.is_enabled)}
                            disabled={busyId === s.id}
                          >
                            {s.is_enabled ? "Deaktivieren" : "Aktivieren"}
                          </button>

                          <button
                            className="btn"
                            onClick={() => hardDelete(s.id, label)}
                            disabled={busyId === s.id}
                          >
                            Hart löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
