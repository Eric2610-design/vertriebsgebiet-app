"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

type MapRow = {
  location_id: string;
  dealer_id: string;
  dealer_name: string;
  street: string | null;
  zipcode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  sources: string[];
  in_territory: boolean;
};

function defaultSourcePick(all: { code: string; name: string }[]) {
  // wenn deine source_types.code z.B. "bico", "zeg", "rm" o.ä. sind
  const wanted = all
    .filter((s) => /bico|zeg|riese|müller|mueller|\brm\b/i.test(`${s.code} ${s.name}`))
    .map((s) => s.code);
  return wanted.length ? wanted : all.map((s) => s.code);
}

export default function MapClient() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [sourceTypes, setSourceTypes] = useState<{ code: string; name: string }[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [territoryOnly, setTerritoryOnly] = useState(true);

  const [rows, setRows] = useState<MapRow[]>([]);
  const [stats, setStats] = useState<{ total: number; shown: number; missingGeo: number }>({ total: 0, shown: 0, missingGeo: 0 });
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");

  // Meta laden (Workspaces + SourceTypes)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/meta");
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "Meta konnte nicht geladen werden.");
        setWorkspaces(j.workspaces ?? []);
        setSourceTypes(j.sourceTypes ?? []);
        setWorkspaceId((j.workspaces?.[0]?.id as string) ?? "");
        setSelectedSources(defaultSourcePick(j.sourceTypes ?? []));
      } catch (e: any) {
        setError(e?.message ?? "Meta-Fehler");
      }
    })();
  }, []);

  async function load() {
    if (!workspaceId) return;
    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams({
        workspaceId,
        sources: selectedSources.join(","),
        territory: territoryOnly ? "1" : "0",
      });

      const res = await fetch(`/api/map/locations?${qs.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Locations konnten nicht geladen werden.");

      setRows(j.locations ?? []);
      setStats(j.stats ?? { total: 0, shown: 0, missingGeo: 0 });
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Laden");
      setRows([]);
      setStats({ total: 0, shown: 0, missingGeo: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function geocodeMissing() {
    if (!workspaceId) return;
    setGeocoding(true);
    setError("");

    try {
      const res = await fetch("/api/map/geocode-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, limit: 15, territoryOnly }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Geocoding fehlgeschlagen.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Geocoding-Fehler");
    } finally {
      setGeocoding(false);
    }
  }

  function toggleSource(code: string) {
    setSelectedSources((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  const withCoords = useMemo(() => rows.filter((r) => typeof r.lat === "number" && typeof r.lng === "number"), [rows]);
  const missingCoords = useMemo(() => rows.filter((r) => r.lat === null || r.lng === null), [rows]);

  // Auto-load wenn workspace gesetzt ist
  useEffect(() => {
    if (workspaceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px" }}>
          <label>Workspace</label>
          <select className="input" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: "1 1 240px" }}>
          <label>Gebiet</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
            <input type="checkbox" checked={territoryOnly} onChange={(e) => setTerritoryOnly(e.target.checked)} />
            Nur PLZ 35–36, 53–57, 60–69
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={load} disabled={loading || !workspaceId}>
            {loading ? "Lade..." : "Daten laden"}
          </button>
          <button className="btn" onClick={geocodeMissing} disabled={geocoding || !workspaceId || rows.length === 0}>
            {geocoding ? "Geocoding..." : "Koordinaten berechnen"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Quellen (Filter)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sourceTypes.map((s) => (
            <button
              key={s.code}
              type="button"
              className={`badge ${selectedSources.includes(s.code) ? "green" : ""}`}
              onClick={() => toggleSource(s.code)}
              style={{ cursor: "pointer" }}
              title={s.code}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <small>Gesamt: {stats.total} · Angezeigt: {stats.shown} · Ohne Koordinaten: {stats.missingGeo}</small>
        {error && <div><small style={{ color: "crimson" }}>{error}</small></div>}
        {missingCoords.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <small>Tipp: „Koordinaten berechnen“ mehrfach klicken (je ~15 Adressen), bis „Ohne Koordinaten“ klein ist.</small>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }} className="map-wrap">
        <LeafletMap locations={withCoords as any} />
      </div>

      {missingCoords.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <details>
            <summary><small>Ohne Koordinaten anzeigen ({missingCoords.length})</small></summary>
            <div style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Händler</th>
                    <th>Adresse</th>
                    <th>Quellen</th>
                  </tr>
                </thead>
                <tbody>
                  {missingCoords.slice(0, 50).map((r) => (
                    <tr key={r.location_id}>
                      <td>{r.dealer_name}</td>
                      <td>{[r.street, `${r.zipcode ?? ""} ${r.city ?? ""}`].filter(Boolean).join(", ")}</td>
                      <td><small>{(r.sources ?? []).join(", ")}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {missingCoords.length > 50 && <small>… (gekürzt auf 50)</small>}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
