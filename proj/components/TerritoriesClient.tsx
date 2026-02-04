"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Row = {
  region: string;
  count: number;
  withGeo: number;
  missingGeo: number;
};

type Resp = {
  ok: boolean;
  rows: Row[];
  total: number;
  sources: string[];
};

export default function TerritoriesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [source, setSource] = useState<string>("");
  const [onlyMaster, setOnlyMaster] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (onlyMaster) params.set("onlyMaster", "1");

      const res = await fetch(`/api/dealers/territories?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as Resp;
      if (!json.ok) throw new Error((json as any).error ?? "territories failed");

      setRows(json.rows ?? []);
      setSources(json.sources ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setErr(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, onlyMaster]);

  const top = useMemo(() => rows.slice().sort((a, b) => b.count - a.count), [rows]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Gebiete</h3>
            <p className="cardSub">Gruppierung nach PLZ-Region (erste 2 Stellen). Ideal als Vertriebs-Heatmap-Preview.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/">← Karte</Link>
            <span className="badge">Datensätze: {total}</span>
            {loading ? <span className="badge">Lade …</span> : null}
          </div>
        </div>
        <div className="cardBody">
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={onlyMaster} onChange={(e) => setOnlyMaster(e.target.checked)} />
              Nur Master
            </label>

            {sources.length ? (
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Alle Quellen</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : null}

            <span className="badge">Regionen: {rows.length}</span>
          </div>

          {err ? <div className="badge danger">{err}</div> : null}

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Händler</th>
                  <th>Geo OK</th>
                  <th>Geo fehlt</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.region}>
                    <td>
                      <span className="badge">{r.region}</span>
                    </td>
                    <td style={{ fontWeight: 900 }}>{r.count}</td>
                    <td>{r.withGeo ? <span className="badge ok">{r.withGeo}</span> : <span className="badge">0</span>}</td>
                    <td>{r.missingGeo ? <span className="badge warn">{r.missingGeo}</span> : <span className="badge">0</span>}</td>
                  </tr>
                ))}
                {!top.length ? (
                  <tr>
                    <td colSpan={4} style={{ opacity: 0.7 }}>
                      Keine Daten (oder PLZ fehlen).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Nächster Step (optional): echte Gebietsflächen (GeoJSON) + Außendienst-Zuordnung.
          </div>
        </div>
      </div>
    </div>
  );
}
