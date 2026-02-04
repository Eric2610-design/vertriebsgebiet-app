"use client";

import { useState } from "react";
import LeafletMap from "@/components/LeafletMap";

export default function HomePage() {
  const [msg, setMsg] = useState<string>("");

  async function geocodeMissing() {
    setMsg("Starte Geocoding (fehlende Koordinaten)…");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, onlyMissing: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMsg(`❌ ${json.error ?? "Fehler"}`);
        return;
      }
      setMsg(`✅ Geocoding fertig: processed=${json.processed}, success=${json.success}, failed=${json.failed}. Seite neu laden für neue Marker.`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Händlerkarte</h1>
        <button onClick={geocodeMissing} style={{ padding: "8px 12px", cursor: "pointer" }}>
          Fehlende Adressen geocoden (50)
        </button>
        <a href="/admin/dealers" style={{ opacity: 0.8 }}>→ Dublettenkontrolle</a>
        <a href="/upload" style={{ opacity: 0.8 }}>→ Upload</a>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <LeafletMap />
      </div>

      <p style={{ marginTop: 10, opacity: 0.7 }}>
        Hinweis: Nominatim (OSM) ist rate-limited. Für viele Händler den Button mehrfach drücken.
      </p>
    </main>
  );
}
