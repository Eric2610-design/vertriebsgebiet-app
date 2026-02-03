"use client";

import React, { useEffect, useMemo, useState } from "react";

type DealerLocation = {
  id?: string;
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
};

type DealerCore = {
  id: string;
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
};

type DealerNote = {
  id: string;
  created_at?: string;
  text: string;
};

type DealerApiResponse =
  | {
      ok: true;
      dealer: DealerCore;
      locations?: DealerLocation[];
      sources?: Array<{ source?: string; external_id?: string; name?: string }>;
      stats?: any;
      notes?: DealerNote[]; // optional, je nach API
    }
  | {
      ok: false;
      error?: string;
      message?: string;
      details?: any;
    };

function isProbablyHtml(contentType: string | null, bodyPreview: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const t = (bodyPreview || "").trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html");
}

function fmtAddr(x?: {
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}) {
  const a = [x?.street, [x?.zip, x?.city].filter(Boolean).join(" "), x?.country]
    .filter(Boolean)
    .join(", ");
  return a || "—";
}

function fmtUrl(u?: string | null) {
  if (!u) return "";
  const s = u.trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

function safeDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function DealerClient(props: {
  dealerId: string;
  /** optional: wenn du workspaceId per URL mitgibst: ?workspaceId=... oder ?w=... */
  workspaceId?: string | null;
}) {
  const dealerId = props.dealerId;

  const wsFromUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("workspaceId") || sp.get("workspace") || sp.get("w");
  }, []);

  const workspaceId = props.workspaceId ?? wsFromUrl;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DealerApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Notes (optional)
  const [notesSupported, setNotesSupported] = useState(true);
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);

  async function loadDealer(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);

    try {
      const url =
        typeof window !== "undefined"
          ? new URL(`/api/dealers/${dealerId}`, window.location.origin)
          : null;

      if (!url) throw new Error("Kein Browser-Kontext verfügbar.");

      if (workspaceId) url.searchParams.set("workspaceId", workspaceId);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });

      // Manche Fehler liefern HTML (Redirect, NotFound, Middleware etc.)
      const raw = await res.text();
      const preview = raw.slice(0, 400);
      const ct = res.headers.get("content-type");

      if (!res.ok) {
        if (isProbablyHtml(ct, preview)) {
          throw new Error(
            `API liefert HTML statt JSON (Status ${res.status}). Das passiert z.B. bei Redirect/NotFound/Middleware.\n` +
              `👉 Check: Öffne /api/dealers/${dealerId} direkt im Browser – wenn du HTML siehst, ist die Route/Protection falsch.\n` +
              `Preview: ${preview.replace(/\s+/g, " ").slice(0, 220)}…`
          );
        }

        // JSON-Fehler versuchen zu lesen
        try {
          const j = JSON.parse(raw) as DealerApiResponse;
          setData(j);
          throw new Error(
            j && (j as any).error
              ? String((j as any).error)
              : `HTTP ${res.status}`
          );
        } catch {
          throw new Error(
            `API Fehler (Status ${res.status}): ${preview.replace(/\s+/g, " ").slice(0, 220)}…`
          );
        }
      }

      // OK -> JSON parsen
      let j: DealerApiResponse;
      try {
        j = JSON.parse(raw) as DealerApiResponse;
      } catch {
        if (isProbablyHtml(ct, preview)) {
          throw new Error(
            `API liefert HTML statt JSON (Status ${res.status}). Preview: ${preview
              .replace(/\s+/g, " ")
              .slice(0, 220)}…`
          );
        }
        throw new Error("Antwort ist kein gültiges JSON.");
      }

      setData(j);
      if (!("ok" in j) || (j as any).ok !== true) {
        const msg = (j as any).error || (j as any).message || "Unbekannter Fehler";
        throw new Error(String(msg));
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadNotes(signal?: AbortSignal) {
    if (!notesSupported) return;
    setNoteErr(null);

    try {
      const url = new URL(`/api/dealers/${dealerId}/notes`, window.location.origin);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });

      if (res.status === 404) {
        // Notes-API existiert ggf. noch nicht -> UI ausblenden
        setNotesSupported(false);
        return;
      }

      const raw = await res.text();
      if (!res.ok) {
        const preview = raw.slice(0, 200).replace(/\s+/g, " ");
        throw new Error(`Notes API Fehler (${res.status}): ${preview}…`);
      }

      const j = JSON.parse(raw);
      const list: DealerNote[] =
        j?.notes || j?.data || (Array.isArray(j) ? j : []) || [];
      setNotes(Array.isArray(list) ? list : []);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setNoteErr(String(e?.message || e));
    }
  }

  async function addNote() {
    const txt = noteText.trim();
    if (!txt) return;

    setNoteBusy(true);
    setNoteErr(null);

    try {
      const url = new URL(`/api/dealers/${dealerId}/notes`, window.location.origin);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text: txt }),
      });

      const raw = await res.text();
      if (!res.ok) {
        const preview = raw.slice(0, 220).replace(/\s+/g, " ");
        throw new Error(`Notiz konnte nicht gespeichert werden (${res.status}): ${preview}…`);
      }

      setNoteText("");
      // neu laden
      await loadNotes();
    } catch (e: any) {
      setNoteErr(String(e?.message || e));
    } finally {
      setNoteBusy(false);
    }
  }

  useEffect(() => {
    if (!dealerId) return;

    const ac = new AbortController();
    loadDealer(ac.signal);
    // Notes optional parallel laden
    const ac2 = new AbortController();
    loadNotes(ac2.signal);

    return () => {
      ac.abort();
      ac2.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId, workspaceId]);

  const okData = data && (data as any).ok === true ? (data as any) : null;
  const dealer: DealerCore | null = okData?.dealer || null;
  const locations: DealerLocation[] = okData?.locations || [];
  const sources: Array<{ source?: string; external_id?: string; name?: string }> =
    okData?.sources || [];

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Händler-Detail</h2>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              ID: <code>{dealerId}</code>
              {workspaceId ? (
                <>
                  {" "}
                  · Workspace: <code>{workspaceId}</code>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <a className="btn secondary" href="/app/map">
              Zur Karte
            </a>
            <a className="btn secondary" href="/app">
              Dashboard
            </a>
          </div>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Lade Daten…</p> : null}

        {err ? (
          <div style={{ marginTop: 12, color: "#b00020", whiteSpace: "pre-wrap" }}>
            <b>Fehler:</b> {err}
            <div style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => loadDealer()}>
                Neu laden
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !err && dealer ? (
          <>
            <hr style={{ margin: "16px 0" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card" style={{ padding: 14 }}>
                <h3 style={{ marginTop: 0 }}>Stammdaten</h3>
                <div><b>Name:</b> {dealer.name || "—"}</div>
                <div><b>Adresse:</b> {fmtAddr(dealer)}</div>
                <div>
                  <b>Telefon:</b>{" "}
                  {dealer.phone ? <a href={`tel:${dealer.phone}`}>{dealer.phone}</a> : "—"}
                </div>
                <div>
                  <b>E-Mail:</b>{" "}
                  {dealer.email ? <a href={`mailto:${dealer.email}`}>{dealer.email}</a> : "—"}
                </div>
                <div>
                  <b>Website:</b>{" "}
                  {dealer.website ? (
                    <a href={fmtUrl(dealer.website)} target="_blank" rel="noreferrer">
                      {dealer.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                {dealer.opening_hours ? (
                  <div style={{ marginTop: 8 }}>
                    <b>Öffnungszeiten:</b>
                    <div style={{ whiteSpace: "pre-wrap" }}>{dealer.opening_hours}</div>
                  </div>
                ) : null}
              </div>

              <div className="card" style={{ padding: 14 }}>
                <h3 style={{ marginTop: 0 }}>Quellen / IDs</h3>
                {sources.length ? (
                  <ul style={{ margin: "8px 0 0 16px" }}>
                    {sources.map((s, i) => (
                      <li key={i}>
                        <b>{s.source || "Quelle"}</b>
                        {s.external_id ? (
                          <>
                            {" "}
                            · ID: <code>{s.external_id}</code>
                          </>
                        ) : null}
                        {s.name ? <> · {s.name}</> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ opacity: 0.7 }}>Keine Quellen gespeichert.</div>
                )}

                <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
                  Tipp: Wenn hier nichts steht, kommt der Händler evtl. nur aus einer Quelle und wurde
                  beim Merge nicht “verlinkt”.
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Standorte</h3>

              {locations.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                        <th style={{ padding: "8px 6px" }}>Name</th>
                        <th style={{ padding: "8px 6px" }}>Adresse</th>
                        <th style={{ padding: "8px 6px" }}>Koordinaten</th>
                        <th style={{ padding: "8px 6px" }}>Quelle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((l, idx) => (
                        <tr key={l.id || idx} style={{ borderBottom: "1px solid #f3f3f3" }}>
                          <td style={{ padding: "8px 6px" }}>{l.name || "—"}</td>
                          <td style={{ padding: "8px 6px" }}>{fmtAddr(l as any)}</td>
                          <td style={{ padding: "8px 6px" }}>
                            {typeof l.lat === "number" && typeof l.lng === "number"
                              ? `${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}`
                              : "—"}
                          </td>
                          <td style={{ padding: "8px 6px" }}>{l.source || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>Keine Standorte gespeichert.</div>
              )}
            </div>

            {notesSupported ? (
              <div className="card" style={{ padding: 14, marginTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>Notizen</h3>

                {noteErr ? (
                  <div style={{ color: "#b00020", marginBottom: 8 }}>{noteErr}</div>
                ) : null}

                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="input"
                    placeholder="Notiz hinzufügen…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                    style={{ width: "100%" }}
                  />
                  <button className="btn" onClick={addNote} disabled={noteBusy || !noteText.trim()}>
                    {noteBusy ? "…" : "Speichern"}
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  {notes.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {notes.map((n) => (
                        <div key={n.id} className="card" style={{ padding: 10 }}>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {n.created_at ? safeDate(n.created_at) : ""}
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>Noch keine Notizen.</div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !err && !dealer ? (
          <div style={{ marginTop: 12, opacity: 0.85 }}>
            Keine Händlerdaten erhalten. Das heißt meist:
            <ul style={{ margin: "8px 0 0 16px" }}>
              <li>Der Händler existiert nicht (ID falsch / gemerged / gelöscht)</li>
              <li>Du bist nicht eingeloggt / Cookie fehlt → API liefert HTML/Redirect</li>
              <li>RLS/Workspace-Check blockt den Zugriff</li>
            </ul>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => loadDealer()}>
              Neu laden
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
