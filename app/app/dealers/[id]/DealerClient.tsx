"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ApiPayload = {
  ok: boolean;
  error?: string;
  extra?: any;
  dealer?: Record<string, any>;
  locations?: any[];
  links?: any[];
  warnings?: any;
};

function firstNonEmpty(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function toMapsUrl(dealer: any, loc?: any) {
  const lat = firstNonEmpty(loc, ["lat", "lng", "latitude", "longitude"]);
  const lng = firstNonEmpty(loc, ["lng", "lon", "longitude"]);
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;

  const street = firstNonEmpty(dealer, ["street", "address", "address1", "street1"]);
  const zip = firstNonEmpty(dealer, ["zip", "zipcode", "postal_code"]);
  const city = firstNonEmpty(dealer, ["city", "town"]);
  const country = firstNonEmpty(dealer, ["country"]);
  const q = [street, zip, city, country].filter(Boolean).join(", ");
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return "";
}

export default function DealerClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [rawError, setRawError] = useState<string>("");

  async function load() {
    setLoading(true);
    setRawError("");
    try {
      const res = await fetch(`/api/dealers/${id}`, { cache: "no-store" });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const txt = await res.text();
        setRawError(
          `API hat kein JSON geliefert (Status ${res.status}). Das ist fast immer ein Routing/404/HTML-Problem.\n\n` +
            txt.slice(0, 1200)
        );
        setPayload(null);
        setLoading(false);
        return;
      }

      const json = (await res.json()) as ApiPayload;
      setPayload(json);

      if (!res.ok || !json.ok) {
        setRawError(
          `API Fehler (Status ${res.status}): ${json.error ?? "unbekannt"}\n` +
            (json.extra ? `\nDetails: ${JSON.stringify(json.extra)}` : "")
        );
      }
    } catch (e: any) {
      setRawError(e?.message ?? String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dealer = payload?.dealer ?? {};
  const locations = payload?.locations ?? [];
  const links = payload?.links ?? [];

  const name = useMemo(() => {
    return (
      firstNonEmpty(dealer, ["name", "dealer_name", "company", "firma"]) ||
      "(ohne Name)"
    );
  }, [dealer]);

  const street = firstNonEmpty(dealer, ["street", "address", "address1", "street1"]);
  const zip = firstNonEmpty(dealer, ["zip", "zipcode", "postal_code"]);
  const city = firstNonEmpty(dealer, ["city", "town"]);
  const country = firstNonEmpty(dealer, ["country"]);
  const phone = firstNonEmpty(dealer, ["phone", "telephone", "tel"]);
  const email = firstNonEmpty(dealer, ["email", "mail"]);
  const web = firstNonEmpty(dealer, ["website", "web", "url", "homepage"]);

  const mapsUrl = toMapsUrl(dealer, locations[0]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{name}</h2>
          <div style={{ opacity: 0.75, fontSize: 13 }}>ID: {id}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Link className="btn secondary" href="/app/map">
            Zur Karte
          </Link>
          <Link className="btn secondary" href="/app">
            Dashboard
          </Link>
        </div>
      </div>

      {loading && <p style={{ marginTop: 16 }}>Lade Händlerdaten…</p>}

      {!loading && rawError && (
        <div style={{ marginTop: 16, color: "#b00020", whiteSpace: "pre-wrap" }}>
          <b>Fehler:</b> {rawError}
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={load}>Neu laden</button>
          </div>
        </div>
      )}

      {!loading && !rawError && payload?.ok && (
        <>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Adresse</h3>
              <div>{street}</div>
              <div>{[zip, city].filter(Boolean).join(" ")}</div>
              <div>{country}</div>

              {mapsUrl && (
                <div style={{ marginTop: 10 }}>
                  <a className="btn secondary" href={mapsUrl} target="_blank" rel="noreferrer">
                    In Google Maps öffnen
                  </a>
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Kontakt</h3>
              {phone ? <div>☎️ {phone}</div> : <div style={{ opacity: 0.7 }}>Telefon: –</div>}
              {email ? (
                <div>
                  ✉️ <a href={`mailto:${email}`}>{email}</a>
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>E-Mail: –</div>
              )}
              {web ? (
                <div>
                  🌐{" "}
                  <a href={web.startsWith("http") ? web : `https://${web}`} target="_blank" rel="noreferrer">
                    {web}
                  </a>
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>Webseite: –</div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Standorte</h3>
              <div style={{ opacity: 0.8 }}>
                {locations.length} Datensätze gefunden
              </div>
              {locations.length > 0 && (
                <pre style={{ marginTop: 10, fontSize: 12, overflowX: "auto" }}>
{JSON.stringify(locations.slice(0, 5), null, 2)}
                </pre>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Quellen / Links</h3>
              <div style={{ opacity: 0.8 }}>
                {links.length} Datensätze gefunden
              </div>
              {links.length > 0 && (
                <pre style={{ marginTop: 10, fontSize: 12, overflowX: "auto" }}>
{JSON.stringify(links.slice(0, 8), null, 2)}
                </pre>
              )}
            </div>
          </div>

          {payload?.warnings && (payload.warnings.locations || payload.warnings.links) && (
            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
              <b>Hinweis:</b> Falls hier Warnings stehen, existieren evtl. Tabellen/Spalten noch nicht exakt so – dann sag mir kurz die Spaltennamen in Supabase, dann passen wir’s an.
              <pre style={{ marginTop: 8, fontSize: 12, overflowX: "auto" }}>
{JSON.stringify(payload.warnings, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
