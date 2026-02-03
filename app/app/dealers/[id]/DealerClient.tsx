"use client";

import { useEffect, useMemo, useState } from "react";
import DealerMiniMap from "./DealerMiniMap";

type DealerLocation = {
  id: string;
  name?: string | null;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  opening_hours?: string | null;
  lat?: number | null;
  lng?: number | null;
  source_type_code?: string | null;
};

type DealerPayload = {
  dealer: {
    id: string;
    canonical_name?: string | null;
    created_at?: string | null;
  };
  locations: DealerLocation[];
};

type Note = {
  id: string;
  dealer_id: string;
  note: string;
  created_at: string;
  created_by_email?: string | null;
};

async function safeText(res: Response) {
  try {
    const t = await res.text();
    return (t || "").slice(0, 500); // nicht alles ausspucken
  } catch {
    return "";
  }
}

async function fetchJsonWithFallback<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const a = await fetch(path, { ...init, credentials: "include" });

  // Fallback auf /app/api wenn /api 404 liefert
  const res =
    a.status === 404
      ? await fetch(`/app${path}`, { ...init, credentials: "include" })
      : a;

  if (!res.ok) {
    const preview = await safeText(res);
    throw new Error(
      `API Fehler (${res.status}) für ${path}. ${preview ? `Antwort: ${preview}` : res.statusText}`
    );
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const preview = await safeText(res);
    throw new Error(
      `API liefert kein JSON für ${path} (content-type: ${ct || "?"}). Vorschau: ${preview}`
    );
  }

  return (await res.json()) as T;
}

export default function DealerClient({ dealerId }: { dealerId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DealerPayload | null>(null);

  const [notesLoading, setNotesLoading] = useState(true);
  const [notesErr, setNotesErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");

  const primary = useMemo(() => data?.locations?.[0] ?? null, [data]);

  function fmtAddr(l: DealerLocation | null) {
    if (!l) return "";
    const line1 = [l.street].filter(Boolean).join(" ");
    const line2 = [l.zipcode, l.city].filter(Boolean).join(" ");
    return [line1, line2, l.country].filter(Boolean).join(", ");
  }

  function googleMapsLink(l: DealerLocation | null) {
    const q = encodeURIComponent(fmtAddr(l) || "");
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  // Dealer laden
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      setData(null);

      try {
        const json = await fetchJsonWithFallback<DealerPayload>(
          `/api/dealers/${dealerId}`
        );
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Unbekannter Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [dealerId]);

  // Notes laden
  async function loadNotes() {
    setNotesLoading(true);
    setNotesErr(null);
    try {
      const json = await fetchJsonWithFallback<{ notes: Note[] } | Note[]>(
        `/api/dealers/${dealerId}/notes`
      );
      const arr = Array.isArray(json) ? json : json.notes;
      setNotes(arr ?? []);
    } catch (e: any) {
      setNotesErr(e?.message || "Unbekannter Fehler");
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  async function saveNote() {
    const note = newNote.trim();
    if (!note) return;

    setNotesErr(null);
    try {
      await fetchJsonWithFallback<{ ok: true }>(
        `/api/dealers/${dealerId}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        }
      );
      setNewNote("");
      await loadNotes();
    } catch (e: any) {
      setNotesErr(e?.message || "Unbekannter Fehler");
    }
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Händler-Detail</h2>
          <div style={{ opacity: 0.75, fontSize: 13 }}>ID: {dealerId}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn secondary" href="/app/map">
            Zur Karte
          </a>
          <a className="btn secondary" href="/app">
            Dashboard
          </a>
        </div>
      </div>

      {loading && <p style={{ marginTop: 16 }}>Lade Händlerdaten…</p>}
      {err && (
        <p style={{ marginTop: 16, color: "crimson", whiteSpace: "pre-wrap" }}>
          {err}
        </p>
      )}

      {!loading && !err && data && (
        <>
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 16,
            }}
          >
            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Stammdaten</h3>

              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>Name</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {data.dealer.canonical_name || primary?.name || "—"}
                  </div>
                </div>

                <div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>Adresse</div>
                  <div>{fmtAddr(primary) || "—"}</div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  {primary?.website && (
                    <a
                      className="btn secondary"
                      href={primary.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Webseite
                    </a>
                  )}
                  {primary?.email && (
                    <a className="btn secondary" href={`mailto:${primary.email}`}>
                      E-Mail
                    </a>
                  )}
                  {primary?.phone && (
                    <a className="btn secondary" href={`tel:${primary.phone}`}>
                      Anrufen
                    </a>
                  )}
                  {fmtAddr(primary) && (
                    <a
                      className="btn secondary"
                      href={googleMapsLink(primary)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Route (Google Maps)
                    </a>
                  )}
                </div>

                {primary?.opening_hours && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      Öffnungszeiten
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {primary.opening_hours}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Karte</h3>
              {primary?.lat != null && primary?.lng != null ? (
                <DealerMiniMap lat={primary.lat} lng={primary.lng} />
              ) : (
                <p style={{ opacity: 0.75, margin: 0 }}>
                  Keine Geokoordinaten vorhanden (noch nicht geocodiert).
                </p>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Standorte / Quellen</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {data.locations.map((l) => (
                <div
                  key={l.id}
                  style={{
                    padding: 12,
                    border: "1px solid #eee",
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{l.name || "Standort"}</div>
                      <div style={{ opacity: 0.8 }}>{fmtAddr(l) || "—"}</div>
                      <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
                        Quelle: {l.source_type_code || "—"}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      {fmtAddr(l) && (
                        <a
                          className="btn secondary"
                          href={googleMapsLink(l)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Maps
                        </a>
                      )}
                      {l.website && (
                        <a
                          className="btn secondary"
                          href={l.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Web
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {data.locations.length === 0 && (
                <p style={{ margin: 0 }}>Keine Standorte gefunden.</p>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Notizen / Besuche</h3>

            {notesLoading && <p>Lade Notizen…</p>}
            {notesErr && (
              <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{notesErr}</p>
            )}

            {!notesLoading && (
              <>
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  {notes.length === 0 && (
                    <p style={{ margin: 0, opacity: 0.75 }}>Noch keine Notizen.</p>
                  )}
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: 12,
                        border: "1px solid #eee",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.note}</div>
                      <div style={{ opacity: 0.65, fontSize: 12, marginTop: 8 }}>
                        {new Date(n.created_at).toLocaleString()}{" "}
                        {n.created_by_email ? `– ${n.created_by_email}` : ""}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Neue Notiz… (z.B. Besuch geplant, Ansprechpartner, ToDos)"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      onClick={saveNote}
                      disabled={newNote.trim().length === 0}
                    >
                      Speichern
                    </button>
                    <button className="btn secondary" onClick={loadNotes}>
                      Aktualisieren
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
