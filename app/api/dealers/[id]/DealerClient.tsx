"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const DealerMiniMap = dynamic(() => import("./DealerMiniMap"), { ssr: false });

function pick(v: any, keys: string[]) {
  for (const k of keys) if (v?.[k]) return v[k];
  return null;
}

function fmtAddr(l: any) {
  const street = l?.street ?? l?.address ?? null;
  const zip = l?.zipcode ?? l?.zip ?? null;
  const city = l?.city ?? null;
  return [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export default function DealerClient({ dealer, locations }: { dealer: any; locations: any[] }) {
  const dealerId = dealer?.id as string;

  const name = pick(dealer, ["name", "dealer_name", "display_name", "canonical_name", "company"]) ?? "Unbenannter Händler";
  const website = pick(dealer, ["website", "url", "web", "homepage"]);
  const email = pick(dealer, ["email", "mail"]);
  const phone = pick(dealer, ["phone", "phonenumber", "tel", "telephone"]);

  const primary =
    locations?.find((x: any) => x?.is_primary === true) ??
    locations?.find((x: any) => x?.primary === true) ??
    locations?.[0] ??
    null;

  const primaryLat = primary?.lat ?? primary?.latitude ?? null;
  const primaryLng = primary?.lng ?? primary?.lon ?? primary?.longitude ?? null;

  const mapsLink = useMemo(() => {
    const q = fmtAddr(primary);
    if (!q) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [primary]);

  // Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [note_type, setNoteType] = useState("note");
  const [occurred_at, setOccurredAt] = useState<string>("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  async function loadNotes() {
    setLoadingNotes(true);
    setErr("");
    try {
      const res = await fetch(`/api/dealers/${dealerId}/notes`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Notes konnten nicht geladen werden.");
      setNotes(j.notes ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Notes Fehler");
    } finally {
      setLoadingNotes(false);
    }
  }

  async function saveNote() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/dealers/${dealerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_type,
          occurred_at: occurred_at ? occurred_at : null,
          title: title.trim() || null,
          note: note.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen.");

      setTitle("");
      setNote("");
      setOccurredAt("");
      setNoteType("note");

      await loadNotes();
    } catch (e: any) {
      setErr(e?.message ?? "Save Fehler");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (dealerId) loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
      {/* Top: Kontakt + Mini-Map */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Stammdaten</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <div><b>Name:</b> {name}</div>
            <div><b>Adresse:</b> {primary ? fmtAddr(primary) : "—"}</div>

            <div><b>Telefon:</b> {phone ? <a href={`tel:${phone}`}>{phone}</a> : "—"}</div>
            <div><b>E-Mail:</b> {email ? <a href={`mailto:${email}`}>{email}</a> : "—"}</div>
            <div><b>Website:</b> {website ? <a href={website} target="_blank" rel="noreferrer">{website}</a> : "—"}</div>

            {mapsLink && (
              <div style={{ marginTop: 6 }}>
                <a className="btn secondary" href={mapsLink} target="_blank" rel="noreferrer">
                  In Google Maps öffnen
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Standorte</h3>

          {locations?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ height: 260, borderRadius: 12, overflow: "hidden", border: "1px solid #e7e7e7" }}>
                <DealerMiniMap locations={locations} />
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Adresse</th>
                    <th>Koordinaten</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l: any) => {
                    const lat = l?.lat ?? l?.latitude ?? null;
                    const lng = l?.lng ?? l?.longitude ?? l?.lon ?? null;
                    return (
                      <tr key={l.id ?? fmtAddr(l)}>
                        <td>{fmtAddr(l) || "—"}</td>
                        <td><small>{lat && lng ? `${lat}, ${lng}` : "—"}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {(primaryLat == null || primaryLng == null) && (
                <small>
                  Hinweis: Mindestens ein Standort hat noch keine Koordinaten. Du kannst das in der Karte über „Koordinaten berechnen“ nachholen.
                </small>
              )}
            </div>
          ) : (
            <small>Keine Standorte vorhanden.</small>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Notizen / Besuche</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label>Typ</label>
            <select className="input" value={note_type} onChange={(e) => setNoteType(e.target.value)}>
              <option value="note">Notiz</option>
              <option value="call">Telefonat</option>
              <option value="email">E-Mail</option>
              <option value="visit">Besuch</option>
            </select>

            <label>Datum (optional)</label>
            <input className="input" type="date" value={occurred_at} onChange={(e) => setOccurredAt(e.target.value)} />

            <label>Titel (optional)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Erstkontakt / Rückruf / Termin" />

            <label>Text</label>
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Was wurde besprochen? Nächster Schritt?"
              rows={4}
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" disabled={saving || !note.trim()} onClick={saveNote}>
                {saving ? "Speichere..." : "Speichern"}
              </button>
              <button className="btn secondary" disabled={loadingNotes} onClick={loadNotes}>
                {loadingNotes ? "Lade..." : "Neu laden"}
              </button>
            </div>

            {err && <small style={{ color: "crimson" }}>{err}</small>}
          </div>

          <hr style={{ border: 0, borderTop: "1px solid #eee" }} />

          <div>
            <h4 style={{ marginTop: 0 }}>Verlauf</h4>
            {loadingNotes ? (
              <small>Lade…</small>
            ) : notes.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {notes.map((n: any) => (
                  <div key={n.id} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="badge green">{n.note_type}</span>
                        {n.occurred_at && <span className="badge">{n.occurred_at}</span>}
                        {n.title && <b>{n.title}</b>}
                      </div>
                      <small>{new Date(n.created_at).toLocaleString()}</small>
                    </div>
                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{n.note}</div>
                  </div>
                ))}
              </div>
            ) : (
              <small>Noch keine Notizen.</small>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
