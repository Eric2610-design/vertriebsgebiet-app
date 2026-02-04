"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DealerRow = {
  id: number;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_master?: boolean | null;
  duplicate_of?: number | null;
};

export default function DealerListClient() {
  const [q, setQ] = useState("");
  const [onlyMaster, setOnlyMaster] = useState(true);
  const [source, setSource] = useState("");
  const [limit, setLimit] = useState(500);
  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (onlyMaster) params.set("onlyMaster", "1");
      if (source.trim()) params.set("source", source.trim());
      params.set("withGeo", "0");
      params.set("limit", String(limit));

      const res = await fetch(`/api/dealers/list?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "list failed");
      setDealers(json.dealers ?? []);
    } catch (e: any) {
      setErr(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onlyMaster, source, limit]);

  const hasGeo = useMemo(() => dealers.filter((d) => d.lat != null && d.lng != null).length, [dealers]);

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h3 className="cardTitle">Händlerliste</h3>
          <p className="cardSub">Filter, Link zur Detailseite, Geo-Status.</p>
        </div>
        <div className="row">
          <Link className="pill" href="/">← Zur Karte</Link>
          <span className="badge">Treffer: {dealers.length}</span>
          <span className="badge">mit Geo: {hasGeo}</span>
        </div>
      </div>

      <div className="cardBody">
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Suche Name / Ort / PLZ …"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />

          <label className="pill" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMaster} onChange={(e) => setOnlyMaster(e.target.checked)} />
            Nur Master
          </label>

          <input
            className="input"
            placeholder="Quelle (z.B. riese_mueller)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{ minWidth: 220 }}
          />

          <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="5000">5000</option>
          </select>

          {loading ? <span className="badge">Lade …</span> : null}
        </div>

        {err ? <div className="badge danger">{err}</div> : null}

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Adresse</th>
                <th>Quelle</th>
                <th>Geo</th>
                <th>Master</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/dealers/${d.id}`} style={{ color: "#93c5fd", fontWeight: 800 }}>
                      {d.name}
                    </Link>
                    {d.duplicate_of ? <div className="small">Duplikat von #{d.duplicate_of}</div> : null}
                  </td>
                  <td>{[d.street, [d.zipcode, d.city].filter(Boolean).join(" "), d.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>{d.source || "—"}</td>
                  <td>{d.lat != null && d.lng != null ? <span className="badge ok">OK</span> : <span className="badge warn">Fehlt</span>}</td>
                  <td>{d.is_master ? <span className="badge ok">Master</span> : <span className="badge">—</span>}</td>
                </tr>
              ))}
              {!dealers.length ? (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.7 }}>
                    Keine Daten (oder Filter zu streng).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
