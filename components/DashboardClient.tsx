"use client";

import { useEffect, useMemo, useState } from "react";
import DealerMapDynamic from "@/components/DealerMapDynamic";
import type { MapDealer } from "@/components/DealerMap";
import Link from "next/link";

type Stats = {
  ok: boolean;
  counts: {
    total: number;
    masters: number;
    approxUniqueByKey: number;
    withGeo: number;
    missingGeo: number;
    geocodeOk: number;
    geocodeNotFound: number;
    geocodeError: number;
    duplicatesByKey: number;
  };
  sources: string[];
};

export default function DashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dealers, setDealers] = useState<MapDealer[]>([]);
  const [q, setQ] = useState("");
  const [onlyMaster, setOnlyMaster] = useState(true);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  async function loadStats() {
    const res = await fetch("/api/dealers/stats", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setErr(`❌ Stats: ${json.error ?? "unknown"}`);
      return;
    }
    setStats(json);
  }

  async function loadDealers() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (onlyMaster) params.set("onlyMaster", "1");
      if (selectedSources.length) params.set("source", selectedSources.join(","));
      params.set("withGeo", "1");
      params.set("limit", "20000");

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
    loadStats();
  }, []);

  useEffect(() => {
    loadDealers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onlyMaster, selectedSources.join("|")]);

  const top = useMemo(() => dealers.slice(0, 20), [dealers]);

  const sources = stats?.sources ?? [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid grid3">
        <div className="card">
          <div className="cardBody kpi">
            <div className="kpiLabel">Datensätze gesamt</div>
            <div className="kpiValue">{stats?.counts.total ?? "—"}</div>
            <div className="small">Alle importierten Zeilen in der Tabelle <span className="mono">dealers</span>.</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody kpi">
            <div className="kpiLabel">Effektive Händler (Master)</div>
            <div className="kpiValue">{stats?.counts.masters ?? "—"}</div>
            <div className="small">Wenn du Dubletten mergest, ist das deine „echte Händler“-Zahl.</div>
          </div>
        </div>
        <div className="card">
          <div className="cardBody kpi">
            <div className="kpiLabel">Geo-Abdeckung</div>
            <div className="kpiValue">
              {stats ? `${stats.counts.withGeo} / ${stats.counts.total}` : "—"}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="badge ok">ok {stats?.counts.geocodeOk ?? 0}</span>
              <span className="badge warn">not_found {stats?.counts.geocodeNotFound ?? 0}</span>
              <span className="badge danger">error {stats?.counts.geocodeError ?? 0}</span>
            </div>
            {stats && stats.counts.missingGeo > 0 ? (
              <div style={{ marginTop: 10 }}>
                <Link className="pill active" href="/geocoding">Jetzt geocoden →</Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Händlerkarte</h3>
            <p className="cardSub">Cluster-Map mit Filtern. Klick auf Marker → Händlerdetail.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/dealers">Liste öffnen →</Link>
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
              <input
                type="checkbox"
                checked={onlyMaster}
                onChange={(e) => setOnlyMaster(e.target.checked)}
              />
              Nur Master
            </label>

            {sources.length ? (
              <select
                value={selectedSources.join(",")}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setSelectedSources(v ? v.split(",") : []);
                }}
              >
                <option value="">Alle Quellen</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : null}

            <span className="badge">Marker: {dealers.length}</span>
            {loading ? <span className="badge">Lade …</span> : null}
          </div>

          {err ? <div className="badge danger">{err}</div> : null}

          <DealerMapDynamic dealers={dealers} />

          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="small">Vorschlag Dubletten (Name+PLZ+Ort): {stats?.counts.duplicatesByKey ?? "—"}</div>
              <Link className="pill" href="/admin/dealers">Dubletten prüfen →</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Schnellliste (Top 20)</h3>
            <p className="cardSub">Zum schnellen Checken – volle Liste unter „Händler“.</p>
          </div>
        </div>
        <div className="cardBody">
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Ort</th>
                  <th>Quelle</th>
                  <th>Master</th>
                </tr>
              </thead>
              <tbody>
                {top.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/dealers/${d.id}`} style={{ color: "#93c5fd", fontWeight: 800 }}>
                        {d.name}
                      </Link>
                    </td>
                    <td>{[d.zipcode, d.city].filter(Boolean).join(" ") || "—"}</td>
                    <td>{d.source || "—"}</td>
                    <td>{d.is_master ? <span className="badge ok">Master</span> : <span className="badge">—</span>}</td>
                  </tr>
                ))}
                {!top.length ? (
                  <tr><td colSpan={4} style={{ opacity: 0.7 }}>Noch keine Händler mit Geo gefunden (oder Filter zu strikt).</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
