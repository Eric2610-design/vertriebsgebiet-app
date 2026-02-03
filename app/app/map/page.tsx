import MapClient from "./MapClient";

export const dynamic = "force-dynamic";

export default function MapPage() {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Karte</h2>
          <small>PLZ-Filter: 35–36, 53–57, 60–69 · Quellen: BICO / ZEG / R&amp;M</small>
        </div>
        <a className="btn secondary" href="/app">Zurück</a>
      </div>

      <div style={{ marginTop: 14 }}>
        <MapClient />
      </div>
    </div>
  );
}
