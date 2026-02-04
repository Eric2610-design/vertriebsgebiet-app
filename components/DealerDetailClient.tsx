"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Dealer = {
  id: number;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_master?: boolean | null;
  duplicate_of?: number | null;
  notes?: string | null;
};

export default function DealerDetailClient() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setMsg("");
    const res = await fetch(`/api/dealers/get?id=${encodeURIComponent(String(id))}`, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setMsg(`❌ ${json.error ?? "not found"}`);
      return;
    }
    setDealer(json.dealer);
    setNotes(json.dealer?.notes ?? "");
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveNotes() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/dealers/update_notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notes }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "save failed");
      setMsg("✅ Notiz gespeichert");
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!dealer) {
    return (
      <div className="card">
        <div className="cardBody">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link className="pill" href="/">← Zur Karte</Link>
            <Link className="pill" href="/dealers">← Händlerliste</Link>
          </div>
          <div style={{ marginTop: 12 }}>{msg ? <span className="badge danger">{msg}</span> : <span className="badge">Lade …</span>}</div>
        </div>
      </div>
    );
  }

  const addr = [
    dealer.street,
    [dealer.zipcode, dealer.city].filter(Boolean).join(" "),
    dealer.country,
  ].filter(Boolean).join(", ") || "—";

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <Link className="pill" href="/">← Karte</Link>
          <Link className="pill" href="/dealers">← Händler</Link>
          {dealer.is_master ? <span className="badge ok">Master</span> : <span className="badge">Duplikat</span>}
          {dealer.duplicate_of ? <span className="badge warn">von #{dealer.duplicate_of}</span> : null}
          {dealer.source ? <span className="badge">{dealer.source}</span> : null}
        </div>
        <span className="badge">ID #{dealer.id}</span>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">{dealer.name}</h3>
            <p className="cardSub">{addr}</p>
          </div>
          <div className="row">
            {dealer.lat != null && dealer.lng != null ? <span className="badge ok">Geo OK</span> : <span className="badge warn">Geo fehlt</span>}
          </div>
        </div>
        <div className="cardBody">
          <div className="grid grid2">
            <div className="card" style={{ boxShadow: "none" }}>
              <div className="cardBody">
                <div className="kpiLabel">Kontakt</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div><span className="small">Telefon:</span> {dealer.phone || "—"}</div>
                  <div><span className="small">E-Mail:</span> {dealer.email || "—"}</div>
                  <div><span className="small">Website:</span> {dealer.website ? <a href={dealer.website} target="_blank">{dealer.website}</a> : "—"}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: "none" }}>
              <div className="cardBody">
                <div className="kpiLabel">Geo</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div><span className="small">Lat:</span> {dealer.lat ?? "—"}</div>
                  <div><span className="small">Lng:</span> {dealer.lng ?? "—"}</div>
                  <div className="small">Tipp: Wenn du nur Master geocodest, wird die Karte deutlich sauberer.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Besuchsnotizen</h3>
            <p className="cardSub">Hier kannst du später Besuchsberichte / Historie pflegen.</p>
          </div>
          <div className="row">
            <button className="btnPrimary" onClick={saveNotes} disabled={saving}>Speichern</button>
          </div>
        </div>
        <div className="cardBody">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "rgba(255,255,255,0.06)", color: "var(--text)" }}
            placeholder="z.B. 2026-02-04: Besuch, Ansprechpartner, offene Punkte …"
          />
          {msg ? <div style={{ marginTop: 10 }} className={msg.startsWith("✅") ? "badge ok" : "badge danger"}>{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
