"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Run = {
  id: number;
  created_at: string;
  file_name?: string | null;
  source?: string | null;
  rows_in_file?: number | null;
  inserted_count?: number | null;
  updated_count?: number | null;
  skipped_count?: number | null;
  error_count?: number | null;
  notes?: string | null;

  dealers_current?: number | null;
  masters_current?: number | null;
};

function fmt(n: any) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toLocaleString("de-DE") : "0";
}

export default function UploadRunsAdmin() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/uploads/list?limit=2000", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "list failed");
      setRuns(json.runs ?? []);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((r) => {
      const hay = `${r.file_name ?? ""} ${r.source ?? ""} ${r.notes ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [runs, q]);

  async function deleteRun(id: number) {
    if (!confirm(`Diesen Upload-Run #${id} wirklich löschen?\n\n→ Löscht ALLE Händler mit upload_run_id=${id} und danach den Run-Eintrag.`)) return;
    setMsg("");
    try {
      const res = await fetch("/api/uploads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "delete failed");
      setMsg(`✅ Run #${id} gelöscht. Händler gelöscht: ${fmt(json.dealers_deleted)}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    }
  }

  async function purge(mode: "dealers" | "all" | "untracked") {
    let text = "";
    if (mode === "untracked") text = "Alle Händler löschen, die KEINE upload_run_id haben?";
    if (mode === "dealers") text = "ALLE Händler löschen (dealers) – Upload-Historie bleibt?";
    if (mode === "all") text = "ALLES löschen: Händler + Upload-Historie (upload_runs)?";

    if (!confirm(text)) return;

    setMsg("");
    try {
      const res = await fetch("/api/uploads/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "purge failed");
      if (mode === "all") {
        setMsg(`✅ Alles gelöscht. Händler: ${fmt(json.dealers_deleted)}, Upload-Runs: ${fmt(json.runs_deleted)}`);
      } else {
        setMsg(`✅ Gelöscht. Händler: ${fmt(json.dealers_deleted)}`);
      }
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Upload-Historie</h3>
            <p className="cardSub">Welche Dateien wurden importiert? Wie viele Datensätze sind noch in der DB? Löschen pro Upload oder alles.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/upload">
              → Upload
            </Link>
            <Link className="pill" href="/admin/dealers">
              → Dubletten
            </Link>
            <Link className="pill" href="/geocoding">
              → Geocoding
            </Link>
          </div>
        </div>

        <div className="cardBody">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <input
                placeholder="Suche (Datei, Quelle, Notiz)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ minWidth: 280 }}
              />
              <button onClick={load} disabled={loading}>
                {loading ? "Lädt…" : "Neu laden"}
              </button>
            </div>

            <div className="row">
              <button className="btnDanger" onClick={() => purge("untracked")} title="Löscht nur Händler ohne upload_run_id">
                Ungetrackte löschen
              </button>
              <button className="btnDanger" onClick={() => purge("dealers")} title="Löscht alle Händler, Upload-Historie bleibt">
                Alle Händler löschen
              </button>
              <button className="btnDanger" onClick={() => purge("all")} title="Löscht Händler + Upload-Historie">
                Alles löschen
              </button>
            </div>
          </div>

          {msg ? (
            <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 12 }}>{msg}</div>
          ) : null}

          <div style={{ marginTop: 14 }} className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Datum</th>
                  <th>Datei</th>
                  <th>Quelle</th>
                  <th>Zeilen</th>
                  <th>Import</th>
                  <th>Aktuell</th>
                  <th>Notiz</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const dt = r.created_at ? new Date(r.created_at).toLocaleString("de-DE") : "";
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="badge">#{r.id}</span>
                      </td>
                      <td>{dt}</td>
                      <td>{r.file_name ?? "—"}</td>
                      <td>{r.source ?? "—"}</td>
                      <td>{fmt(r.rows_in_file)}</td>
                      <td>
                        <div className="muted" style={{ fontSize: 12 }}>
                          inserted {fmt(r.inserted_count)} · updated {fmt(r.updated_count)} · skipped {fmt(r.skipped_count)} · errors {fmt(r.error_count)}
                        </div>
                      </td>
                      <td>
                        <div className="muted" style={{ fontSize: 12 }}>
                          dealers {fmt(r.dealers_current)} · master {fmt(r.masters_current)}
                        </div>
                      </td>
                      <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{r.notes ?? ""}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                          <Link className="pill" href={`/admin/dealers?runId=${r.id}`} title="Dubletten nur für diesen Upload ansehen">
                            Dubletten
                          </Link>
                          <Link className="pill" href={`/upload?reimport=${r.id}`} title="Rollback dieses Runs + neu importieren">
                            Rollback+Reimport
                          </Link>
                          <button className="btnDanger" onClick={() => deleteRun(r.id)}>
                            Run löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      Keine Upload-Runs gefunden.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Tipp: Wenn du alte Daten ohne upload_run_id importiert hattest, nutze „Ungetrackte löschen“.
          </div>
        </div>
      </div>
    </div>
  );
}
