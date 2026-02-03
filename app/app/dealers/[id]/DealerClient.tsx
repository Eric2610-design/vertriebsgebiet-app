"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AnyRow = Record<string, any>;

function firstNonEmpty(obj: AnyRow | null | undefined, keys: string[]) {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function joinParts(parts: (string | undefined | null)[], sep = " ") {
  return parts.map(p => (p || "").trim()).filter(Boolean).join(sep);
}

function formatAddress(loc: AnyRow | null | undefined) {
  const street = firstNonEmpty(loc, ["street", "adresse", "address", "line1"]);
  const zip = firstNonEmpty(loc, ["zip", "zipcode", "postal_code", "plz", "postcode"]);
  const city = firstNonEmpty(loc, ["city", "ort", "town"]);
  const country = firstNonEmpty(loc, ["country", "country_code", "laendercode", "countrycode"]);
  const line = joinParts([street]);
  const line2 = joinParts([zip, city], " ");
  const line3 = country ? country : "";
  return [line, line2, line3].filter(Boolean).join(", ");
}

export default function DealerClient({ dealerId }: { dealerId: string }) {
  const sp = useSearchParams();
  const debug = sp.get("debug") === "1";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [raw, setRaw] = useState<any>(null);

  const dealer: AnyRow | null = raw?.dealer || raw?.data?.dealer || raw?.data || null;
  const locations: AnyRow[] = raw?.locations || raw?.data?.locations || [];
  const links: AnyRow[] = raw?.links || raw?.data?.links || [];

  const mainLocation = useMemo(() => (locations && locations.length ? locations[0] : null), [locations]);

  const name = useMemo(() => {
    return (
      firstNonEmpty(dealer, ["name", "dealer_name", "company"]) ||
      "(ohne Name)"
    );
  }, [dealer]);

  const address = useMemo(() => {
    // 1) Wenn Dealer selbst Adressfelder hat
    const dealerAddr = joinParts([
      firstNonEmpty(dealer, ["street", "address"]),
      joinParts([firstNonEmpty(dealer, ["zip", "zipcode", "postal_code"]), firstNonEmpty(dealer, ["city"])], " "),
      firstNonEmpty(dealer, ["country", "country_code"]),
    ], ", ");

    // 2) Sonst aus 1. Standort
    const locAddr = formatAddress(mainLocation);

    return (dealerAddr && dealerAddr !== ",") ? dealerAddr : (locAddr || "-");
  }, [dealer, mainLocation]);

  const phone = useMemo(() => {
    return (
      firstNonEmpty(dealer, ["phone", "tel", "telephone"]) ||
      firstNonEmpty(mainLocation, ["phone", "tel", "telephone", "telefonnr"]) ||
      "-"
    );
  }, [dealer, mainLocation]);

  const email = useMemo(() => {
    return (
      firstNonEmpty(dealer, ["email", "e_mail", "mail"]) ||
      firstNonEmpty(mainLocation, ["email", "e_mail", "mail"]) ||
      "-"
    );
  }, [dealer, mainLocation]);

  const website = useMemo(() => {
    return (
      firstNonEmpty(dealer, ["website", "homepage", "url", "web"]) ||
      firstNonEmpty(mainLocation, ["website", "homepage", "url", "web"]) ||
      "-"
    );
  }, [dealer, mainLocation]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/dealers/${dealerId}`, { cache: "no-store" });
      const text = await res.text();

      // Falls irgendwas HTML zurückkommt (Next 404 Seite), siehst du es direkt.
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`API hat kein JSON geliefert (Status ${res.status}). Antwort beginnt mit: ${text.slice(0, 80)}`);
      }

      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ||
          `API Fehler (Status ${res.status})`;
        const details = json?.details ? JSON.stringify(json.details) : "";
        throw new Error(details ? `${msg}: ${details}` : msg);
      }

      setRaw(json);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!dealerId) {
      setErr("Dealer-ID fehlt");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{name}</h2>
          <div style={{ opacity: 0.8, fontSize: 13 }}>ID: {dealerId}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn secondary" href="/app/map">Zur Karte</Link>
          <Link className="btn secondary" href="/app">Dashboard</Link>
        </div>
      </div>

      {loading && <p style={{ marginTop: 12 }}>Lade Daten…</p>}

      {!loading && err && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: "#b00020", whiteSpace: "pre-wrap" }}><b>Fehler:</b> {err}</p>
          <button className="btn" onClick={load}>Neu laden</button>
        </div>
      )}

      {!loading && !err && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>Stammdaten</h3>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 8, columnGap: 12 }}>
              <div style={{ opacity: 0.75 }}>Adresse</div><div>{address}</div>
              <div style={{ opacity: 0.75 }}>Telefon</div><div>{phone}</div>
              <div style={{ opacity: 0.75 }}>E-Mail</div><div>{email}</div>
              <div style={{ opacity: 0.75 }}>Webseite</div>
              <div>
                {website !== "-" ? (
                  <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer">
                    {website}
                  </a>
                ) : (
                  "-"
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>Standorte ({locations?.length || 0})</h3>

            {(!locations || locations.length === 0) ? (
              <p style={{ opacity: 0.8 }}>Keine Standorte vorhanden.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {locations.map((loc, idx) => {
                  const title = firstNonEmpty(loc, ["label", "name", "standort"]) || `Standort ${idx + 1}`;
                  const addr = formatAddress(loc) || "-";
                  const ph = firstNonEmpty(loc, ["phone", "tel", "telephone"]) || "-";
                  const em = firstNonEmpty(loc, ["email"]) || "-";
                  const web = firstNonEmpty(loc, ["website", "homepage", "url"]) || "-";

                  return (
                    <div key={loc.id || idx} className="card" style={{ margin: 0 }}>
                      <div style={{ fontWeight: 700 }}>{title}</div>
                      <div style={{ opacity: 0.9, marginTop: 6 }}>{addr}</div>
                      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, columnGap: 12 }}>
                        <div style={{ opacity: 0.75 }}>Telefon</div><div>{ph}</div>
                        <div style={{ opacity: 0.75 }}>E-Mail</div><div>{em}</div>
                        <div style={{ opacity: 0.75 }}>Webseite</div><div>{web}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {debug && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Debug</h3>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 350, overflow: "auto" }}>
                {JSON.stringify({ dealer, locations, links, raw }, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
