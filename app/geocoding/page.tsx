"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function GeocodingPage() {
  const [counts, setCounts] = useState<{
    total: number;
    withGeo: number;
    missingGeo: number;
    notFound: number;
    error: number;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function loadCounts() {
    // total
    const total = await supabase.from("dealers").select("id", { count: "exact", head: true });
    const withGeo = await supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .not("lat", "is", null)
      .not("lng", "is", null);

    const missingGeo = await supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .is("lat", null)
      .is("lng", null);

    const notFound = await supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_status", "not_found");

    const error = await supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .eq("geocode_status", "error");

    setCounts({
      total: total.count ?? 0,
      withGeo: withGeo.count ?? 0,
      missingGeo: missingGeo.count ?? 0,
      notFound: notFound.count ?? 0,
      error: error.count ?? 0,
    });
  }

  useEffect(() => {
    loadCounts();
  }, []);

  async function runGeocode(limit: number, retryNotFound = false) {
    setBusy(true);
    setMsg(`Starte Geocoding (${limit}) …`);

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit,
          onlyMissing: true,
          retryNotFound,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setMsg(`❌ ${json.error ?? "Fehler"}`);
      } else {
        setMsg(
          `✅ Fertig: processed=${json.processed}, success=${json.success}, notFound=${json.notFound}, failed=${json.failed}`
        );
      }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
      await loadCounts();
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Geocoding</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">→ Karte</Link>
          <Link href="/upload">→ Upload</Link>
          <Link href="/admin/dealers">→ Dubletten</Link>
        </nav>
      </div>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Hier werden fehlende Koordinaten (lat/lng) per OpenStreetMap Nominatim ermittelt. Das ist rate-limited – deshalb in
        Batches laufen lassen.
      </p>

      <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Status</h3>

        {!counts ? (
          <p>Lade …</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Gesamt: <strong>{counts.total}</strong></li>
            <li>Mit Geo: <strong>{counts.withGeo}</strong></li>
            <li>Ohne Geo: <strong>{counts.missingGeo}</strong></li>
            <li>Not found: <strong>{counts.notFound}</strong></li>
            <li>Error: <strong>{counts.error}</strong></li>
          </ul>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => runGeocode(25)} disabled={busy}>
            Fehlende geocoden (25)
          </button>
          <button onClick={() => runGeocode(50)} disabled={busy}>
            Fehlende geocoden (50)
          </button>
          <button onClick={() => runGeocode(100)} disabled={busy}>
            Fehlende geocoden (100)
          </button>
          <button onClick={() => runGeocode(50, true)} disabled={busy}>
            Retry not_found (50)
          </button>
          <button onClick={loadCounts} disabled={busy}>
            Neu laden
          </button>
        </div>

        {msg && (
          <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
            {msg}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, opacity: 0.8, fontSize: 13 }}>
        Tipp: Wenn du 2.000 Händler hast: erst 100er Batches klicken. Danach auf der Karte neu laden – Marker erscheinen
        sofort, sobald lat/lng da sind.
      </div>
    </main>
  );
}
