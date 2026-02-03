'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DealerMiniMap from './DealerMiniMap';

type Dealer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

type Location = {
  id: string;
  dealer_id?: string;
  label?: string | null;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  is_primary?: boolean | null;
  lat?: number | null;
  lng?: number | null;
};

type Note = {
  id: string;
  text?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

type SourceLink = {
  id: string;
  url?: string | null;
  label?: string | null;
  source_type?: string | null;
};

function clean(v?: string | null) {
  const s = (v ?? '').toString().trim();
  return s.length ? s : '';
}

function fmtAddress(loc?: Location | null) {
  if (!loc) return '';
  const parts = [clean(loc.street), [clean(loc.zipcode), clean(loc.city)].filter(Boolean).join(' '), clean(loc.country)]
    .filter(Boolean)
    .join(', ');
  return parts;
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export default function DealerClient({ dealerId }: { dealerId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [links, setLinks] = useState<SourceLink[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const primaryLoc = useMemo(() => {
    if (!locations?.length) return null;
    const primary = locations.find((l) => l.is_primary);
    return primary ?? locations[0];
  }, [locations]);

  const displayName = useMemo(() => {
    const dn =
      clean(dealer?.name) ||
      clean(primaryLoc?.label) ||
      // notfalls: aus Adresse irgendwas basteln, damit es nie leer ist
      (clean(primaryLoc?.city) ? `Händler (${clean(primaryLoc?.city)})` : '');
    return dn || '(ohne Name)';
  }, [dealer?.name, primaryLoc?.label, primaryLoc?.city]);

  async function load() {
    setErr('');
    setLoading(true);

    try {
      if (!dealerId || !isUuid(dealerId)) {
        throw new Error(`Ungültige Händler-ID: ${dealerId || '(leer)'}`);
      }

      const res = await fetch(`/api/dealers/${encodeURIComponent(dealerId)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => '');
        const msg =
          typeof body === 'string'
            ? body
            : body?.error?.message || body?.message || JSON.stringify(body ?? { status: res.status });
        throw new Error(msg);
      }

      // JSON erwarten
      const payload: any = ct.includes('application/json') ? await res.json() : null;
      if (!payload) throw new Error('API hat keine JSON-Antwort geliefert.');

      // flexible shape
      const d: Dealer | null = payload.dealer ?? payload.data?.dealer ?? payload?.dealer_row ?? null;
      const locs: Location[] = payload.locations ?? payload.data?.locations ?? payload?.dealer_locations ?? [];
      const lks: SourceLink[] = payload.links ?? payload.data?.links ?? payload?.source_links ?? [];
      const nts: Note[] = payload.notes ?? payload.data?.notes ?? payload?.dealer_notes ?? [];

      setDealer(d);
      setLocations(Array.isArray(locs) ? locs : []);
      setLinks(Array.isArray(lks) ? lks : []);
      setNotes(Array.isArray(nts) ? nts : []);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
      setDealer(null);
      setLocations([]);
      setLinks([]);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    const text = newNote.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/dealers/${encodeURIComponent(dealerId)}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => '');
        throw new Error(typeof body === 'string' ? body : body?.error?.message || body?.message || 'Fehler beim Speichern.');
      }
      setNewNote('');
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setSavingNote(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginTop: 0 }}>{loading ? 'Lade…' : displayName}</h1>
          <small style={{ opacity: 0.8 }}>ID: {dealerId}</small>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <a className="btn secondary" href="/app/map">
            Zur Karte
          </a>
          <a className="btn secondary" href="/app">
            Dashboard
          </a>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#b00020', fontWeight: 600 }}>Fehler</div>
          <div style={{ color: '#b00020', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{err}</div>
          <button className="btn" style={{ marginTop: 10 }} onClick={load}>
            Neu laden
          </button>
        </div>
      )}

      {!err && loading && <p style={{ marginTop: 12 }}>Lade Händlerdaten…</p>}

      {!err && !loading && (
        <>
          {/* Stammdaten */}
          <div className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Stammdaten</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 16 }}>
              <div style={{ opacity: 0.8 }}>Adresse</div>
              <div>{fmtAddress(primaryLoc) || '-'}</div>

              <div style={{ opacity: 0.8 }}>Telefon</div>
              <div>{clean(dealer?.phone) || clean(primaryLoc?.phone) || '-'}</div>

              <div style={{ opacity: 0.8 }}>E-Mail</div>
              <div>{clean(dealer?.email) || clean(primaryLoc?.email) || '-'}</div>

              <div style={{ opacity: 0.8 }}>Webseite</div>
              <div>
                {clean(dealer?.website) || clean(primaryLoc?.website) ? (
                  <a href={clean(dealer?.website) || clean(primaryLoc?.website)} target="_blank" rel="noreferrer">
                    {clean(dealer?.website) || clean(primaryLoc?.website)}
                  </a>
                ) : (
                  '-'
                )}
              </div>
            </div>
          </div>

          {/* Mini Map */}
          <div className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Karte</h2>
            <DealerMiniMap locations={locations as any} />
          </div>

          {/* Standorte */}
          <div className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Standorte ({locations.length})</h2>

            {!locations.length && <p style={{ opacity: 0.8 }}>Keine Standorte vorhanden.</p>}

            {!!locations.length && (
              <div style={{ display: 'grid', gap: 12 }}>
                {locations.map((loc) => {
                  const title = clean(loc.label) || (loc.is_primary ? 'Hauptadresse' : 'Standort');
                  return (
                    <div key={loc.id} className="card">
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 6, columnGap: 16 }}>
                        <div style={{ opacity: 0.8 }}>Adresse</div>
                        <div>{fmtAddress(loc) || '-'}</div>

                        <div style={{ opacity: 0.8 }}>Telefon</div>
                        <div>{clean(loc.phone) || '-'}</div>

                        <div style={{ opacity: 0.8 }}>E-Mail</div>
                        <div>{clean(loc.email) || '-'}</div>

                        <div style={{ opacity: 0.8 }}>Webseite</div>
                        <div>
                          {clean(loc.website) ? (
                            <a href={clean(loc.website)} target="_blank" rel="noreferrer">
                              {clean(loc.website)}
                            </a>
                          ) : (
                            '-'
                          )}
                        </div>

                        <div style={{ opacity: 0.8 }}>Koordinaten</div>
                        <div>
                          {loc.lat != null && loc.lng != null ? `${loc.lat}, ${loc.lng}` : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quellen / Links */}
          {links.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <h2 style={{ marginTop: 0 }}>Quellen</h2>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {links.map((l) => (
                  <li key={l.id}>
                    <a href={clean(l.url) || '#'} target="_blank" rel="noreferrer">
                      {clean(l.label) || clean(l.url) || '(ohne Link)'}
                    </a>
                    {clean(l.source_type) ? <span style={{ opacity: 0.7 }}> — {l.source_type}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notizen */}
          <div className="card" style={{ marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>Notizen</h2>

            {notes.length === 0 && <p style={{ opacity: 0.8 }}>Noch keine Notizen.</p>}

            {notes.length > 0 && (
              <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                {notes.map((n) => (
                  <div key={n.id} className="card">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{clean(n.text) || '-'}</div>
                    <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                      {clean(n.created_at) ? new Date(n.created_at as string).toLocaleString() : ''}
                      {clean(n.created_by) ? ` — ${n.created_by}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              <textarea
                className="input"
                rows={3}
                placeholder="Neue Notiz…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={addNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? 'Speichere…' : 'Notiz speichern'}
                </button>
                <button className="btn secondary" onClick={load}>
                  Aktualisieren
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
