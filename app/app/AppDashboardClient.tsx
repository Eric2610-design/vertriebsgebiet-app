"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SourceTypesPanel from "./SourceTypesPanel";

export const dynamic = "force-dynamic";

type Workspace = { id: string; name?: string | null; title?: string | null };
type MetaOk = {
  ok: true;
  workspaces?: Workspace[];
  workspace_id?: string | null;
  workspaceId?: string | null;
};

function pickName(w: Workspace) {
  return w.name || w.title || w.id;
}

export default function AppDashboardClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [rawMeta, setRawMeta] = useState<any>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");

  async function loadMeta() {
    setLoading(true);
    setErr("");
    setRawMeta(null);

    try {
      const res = await fetch("/api/meta", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const ct = res.headers.get("content-type") || "";
      const text = await res.text();

      let json: MetaOk | any = null;
      try {
        json = ct.includes("application/json") ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push("/login");
          return;
        }
        throw new Error(json?.error?.message || json?.message || `API Fehler (${res.status})`);
      }

      if (!json || json.ok !== true) {
        throw new Error(json?.error?.message || json?.error || "Meta nicht ok");
      }

      setRawMeta(json);

      const ws: Workspace[] = Array.isArray(json.workspaces) ? json.workspaces : [];
      setWorkspaces(ws);

      const urlW = (params.get("w") || "").trim();
      const storedW = window.localStorage.getItem("vg.workspaceId") || "";
      const metaW = (json.workspace_id || json.workspaceId || "") as string;

      const initial =
        (urlW && ws.some((x) => x.id === urlW) ? urlW : "") ||
        (storedW && ws.some((x) => x.id === storedW) ? storedW : "") ||
        (metaW && ws.some((x) => x.id === metaW) ? metaW : "") ||
        (ws[0]?.id ?? "");

      setWorkspaceId(initial);

      if (initial) {
        window.localStorage.setItem("vg.workspaceId", initial);
        const u = new URL(window.location.href);
        u.searchParams.set("w", initial);
        window.history.replaceState({}, "", u.toString());
      }
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workspaceLabel = useMemo(() => {
    const w = workspaces.find((x) => x.id === workspaceId);
    return w ? pickName(w) : "";
  }, [workspaces, workspaceId]);

  function onWorkspaceChange(nextId: string) {
    setWorkspaceId(nextId);
    window.localStorage.setItem("vg.workspaceId", nextId);
    const u = new URL(window.location.href);
    u.searchParams.set("w", nextId);
    window.history.replaceState({}, "", u.toString());
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 6 }}>Dashboard</h1>
            <div style={{ opacity: 0.8 }}>
              Workspace: <b>{workspaceLabel || (loading ? "…" : "(kein Workspace)")}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn secondary" href="/app/map">
              Karte
            </a>
            <button className="btn secondary" onClick={loadMeta} disabled={loading}>
              Aktualisieren
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {loading ? (
          <p style={{ margin: 0 }}>Lade Meta…</p>
        ) : err ? (
          <div style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>
            <b>Fehler:</b> {err}
            {rawMeta ? (
              <pre style={{ marginTop: 10, overflowX: "auto" }}>
                {JSON.stringify(rawMeta, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, opacity: 0.8 }}>
                Workspace auswählen
              </label>
              <select
                className="input"
                value={workspaceId}
                onChange={(e) => onWorkspaceChange(e.target.value)}
                style={{ maxWidth: 520 }}
              >
                {workspaces.length === 0 ? (
                  <option value="">(keine Workspaces)</option>
                ) : (
                  workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {pickName(w)}
                    </option>
                  ))
                )}
              </select>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                Auswahl wird gespeichert (localStorage) + URL (?w=…)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hersteller / Quellen */}
      {workspaceId ? <SourceTypesPanel workspaceId={workspaceId} /> : null}
    </div>
  );
}
