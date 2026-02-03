import MapClient from "./MapClient";

export const dynamic = "force-dynamic";

export default function MapPage() {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Karte</h2>
      <MapClient />
    </div>
  );
}
