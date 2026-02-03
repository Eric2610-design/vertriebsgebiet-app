"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LocationRow = {
  id: string;
  label: string | null;
  street: string | null;
  zipcode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  is_primary: boolean | null;
};

type DealerRow = {
  id: string;
  name: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  created_at: string | null;
};

type ApiResp =
  | {
      ok: true;
      dealer: DealerRow;
      locations: LocationRow[];
      primary_location: LocationRow | null;
    }
  | {
      ok: false;
      error: string;
      details?: any;
    };

function fmtAddress(l: LocationRow | null) {
  if (!l) return "-";
  const parts = [
    l.street?.trim(),
    [l.zipcode?.trim(), l.city?.trim()].filter(Boolean).join(" "),
    l.country?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "-";
}

export default function DealerClient({ dealerId }: { dealerId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dealer, setDealer] = useState<DealerRow | null>(null);
  const [primary, setPrimary] = useState<LocationRow | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/dealers/${dealerId}`, { cache: "no-store" });
      const json: ApiResp = await res.json();

      if (!json.ok) {
        setErr(`${json.error}${json.details ? ` — ${JSON.stringify(json.details)}` : ""}`);
        setDealer(null);
        setPrimary(null);
        setLocations([]);
      } else {
        setDealer(json.dealer);
        setPrimary(json.primary_location);
        setLocations(json.locations);
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!dealerId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  const title = dealer?.display_name || dealer?.name || primary?.label || "(ohne Name)";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{title}</h2>
          <div style={{ opacity: 0.7, fontSize: 13 }}>ID: {dealerId}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn secondary" href="/app/map">
            Zur Karte
          </Link>
          <Link className="btn secondary" href="/app">
            Dashboard
          </Link>
          <button className="btn" onClick={load} disabled={loading}>
            Neu laden
          </button>
        </div>
      </div>

      {loading && <p style={{ marginTop: 12 }}>Lade…</p>}

      {!loading && err && (
        <div style={{ marginTop: 12, color: "#b00020", whiteSpace: "pre-wrap" }}>
          <b>Fehler:</b> {err}
        </div>
      )}

      {!loading && !err && dealer && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>Stammdaten</h3>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
              <div style={{ opacity: 0.7 }}>Adresse</div>
              <div>{fmtAddress(primary)}</div>

              <div style={{ opacity: 0.7 }}>Telefon</div>
              <div>{dealer.phone || "-"}</div>

              <div style={{ opacity: 0.7 }}>E-Mail</div>
              <div>{dealer.email || "-"}</div>

              <div style={{ opacity: 0.7 }}>Webseite</div>
              <div>{dealer.website || "-"}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>Standorte ({locations.length})</h3>
            {locations.length === 0 ? (
              <p style={{ opacity: 0.8 }}>Keine Standorte vorhanden.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {locations.map((l) => (
                  <div key={l.id} className="card" style={{ margin: 0 }}>
                    <b>{l.is_primary ? "Hauptadresse" : l.label || "Standort"}</b>
                    <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "140px 1fr", gap: 6 }}>
                      <div style={{ opacity: 0.7 }}>Adresse</div>
                      <div>{fmtAddress(l)}</div>

                      <div style={{ opacity: 0.7 }}>Telefon</div>
                      <div>{l.phone || "-"}</div>

                      <div style={{ opacity: 0.7 }}>E-Mail</div>
                      <div>{l.email || "-"}</div>

                      <div style={{ opacity: 0.7 }}>Webseite</div>
                      <div>{l.website || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
