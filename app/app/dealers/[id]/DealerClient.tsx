"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type AnyObj = Record<string, any>;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function DealerClient(props: { id?: string }) {
  const params = useParams();

  const routeId = useMemo(() => {
    const p: any = params || {};
    const raw = p.id;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
    return undefined;
  }, [params]);

  const dealerId = props.id ?? routeId;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dealer, setDealer] = useState<AnyObj | null>(null);
  const [locations, setLocations] = useState<AnyObj[]>([]);

  async function load() {
    setErr(null);

    if (!dealerId) {
      setLoading(false);
      setErr("Keine Händler-ID in der URL gefunden (id ist undefined).");
      return;
    }
    if (!isUuid(dealerId)) {
      setLoading(false);
      setErr(`Ungültige Händler-ID (keine UUID): "${dealerId}"`);
      return;
    }

    setLoading(true);
    try {
      // WICHTIG: führender Slash, sonst wird relativ gefetcht -> HTML-404
      const res = await fetch(`/api/dealers/${encodeURIComponent(dealerId)}`, {
        cache: "no-store",
      });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        const body = ct.includes("application/json") ? await res.json() : await res.text();
        const msg =
          typeof body === "string"
            ? body.slice(0, 800)
            : body?.error || body?.message || JSON.stringify(body).slice(0, 800);
        throw new Error(`API Fehler (${res.status}): ${msg}`);
      }

      const data = ct.includes("application/json") ? await res.json() : null;
      const d = (data?.dealer ?? data?.data ?? data) as AnyObj | null;
      const loc = (data?.locations ?? d?.locations ?? []) as AnyObj[];

      setDealer(d);
      setLocations(Array.isArray(loc) ? loc : []);
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  const title =
    dealer?.name ||
    dealer?.canonical_name ||
    dealer?.company ||
    dealer?.firm ||
    "(ohne Name)";

  const primaryLoc = locations.find((l) => l?.is_primary) || locations[0] || null;

  const street = dealer?.street || primaryLoc?.street || "";
  const zipcode = dealer?.zipcode || primaryLoc?.zipcode || "";
  const city = dealer?.city || primaryLoc?.city || "";
  const country = dealer?.country || primaryLoc?.country || "";

  const phone = dealer?.phone || dealer?.phonenumber || primaryLoc?.phone || "";
  const email = dealer?.email || primaryLoc?.email || "";
  const website = dealer?.website || primaryLoc?.website || "";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{title}</h2>
          <div style={{ opacity: 0.75, fontSize: 13 }}>ID: {dealerId || "-"}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn secondary" href="/app/map">Zur Karte</a>
          <a className="btn secondary" href="/app">Dashboard</a>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading && <div>Lade Händler…</div>}

        {!loading && err && (
          <div style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>
            <b>Fehler:</b> {err}
            <div style={{ marginTop: 10 }}>
              <button className="btn" onClick={load}>Neu laden</button>
            </div>
          </div>
        )}

        {!loading && !err && (
          <>
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Stammdaten</h3>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8 }}>
                <div style={{ opacity: 0.7 }}>Adresse</div>
                <div>
                  {[street, [zipcode, city].filter(Boolean).join(" "), country].filter(Boolean).join(", ") || "-"}
                </div>

                <div style={{ opacity: 0.7 }}>Telefon</div>
                <div>{phone || "-"}</div>

                <div style={{ opacity: 0.7 }}>E-Mail</div>
                <div>{email || "-"}</div>

                <div style={{ opacity: 0.7 }}>Webseite</div>
                <div>{website || "-"}</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Standorte ({locations.length})</h3>

              {locations.length === 0 ? (
                <div style={{ opacity: 0.8 }}>Keine Standorte vorhanden.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {locations.map((l, idx) => {
                    const line1 = [l.street].filter(Boolean).join(" ");
                    const line2 = [[l.zipcode, l.city].filter(Boolean).join(" "), l.country].filter(Boolean).join(", ");
                    const label = l.label || (l.is_primary ? "Hauptstandort" : `Standort ${idx + 1}`);
                    return (
                      <div key={l.id || idx} className="card" style={{ margin: 0 }}>
                        <div style={{ fontWeight: 600 }}>{label}{l.is_primary ? " ⭐" : ""}</div>
                        <div style={{ opacity: 0.85 }}>
                          {[line1, line2].filter(Boolean).join(" · ") || "-"}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
                          {[l.phone || "", l.email || "", l.website || ""].filter(Boolean).join(" · ") || ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
