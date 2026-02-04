"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Stats = {
  counts: {
    total: number;
    withGeo: number;
    missingGeo: number;
    ok: number;
    notFound: number;
    error: number;
    masters: number;
    approxUniqueByKey: number;
    sampleSize: number;
  };
  perSource: Record<string, number>;
};

export default function GeocodingPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);

  const stopRef = useRef(false);

  async function loadStats() {
    const res = await fetch("/api/dealers/stats", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setMsg(`❌ Stats Fehler: ${json.error ?? "unknown"}`);
      return;
    }
    setStats(json);
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function runBatch(batchSize: number, retryNotFound = false) {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize, onlyMissing: true, retryNotFound, delayMs: 1100 }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Geocode error");
    return json as {
      processed: number;
      success: number;
      notFound: number;
      failed: number;
      counts: {
        total: number;
        withGeo: number;
        missingGeo: number;
        ok: number;
        notFound: number;
        error: number;
      };
    };
  }

  async function startAutoAll() {
    stopRef.current = false;
    setAutoRun(true);
    setBusy(true);
    setMsg("▶️ Starte Geocode ALL …");

    try {
      // loop, bis missingGeo = 0 oder Stop
      while (!stopRef.current) {
        const r = await runBatch(200, false);

        setMsg(
          `✅ Batch: processed=${r.processed}, success=${r.success}, notFound=${r.notFound}, failed=${r.failed} | ` +
            `Remaining missing=${r.counts.missingGeo}`
        );

        // Stats updaten (für Masters/Unique/perSource)
        await loadStats();

        if (r.counts.missingGeo <= 0) {
          setMsg("🎉 Fertig! Alle Händler haben Geo (oder sind not_found/error).");
          break;
        }

        // Wenn ein Batch 0 processed liefert, sind wir „durch“ (oder alles ist not_found und wird übersprungen)
        if (r.processed === 0) {
          setMsg("ℹ️ Keine weiteren Kandidaten im Batch. (Evtl. nur noch not_found/error).");
          break;
        }
      }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setAutoRun(false);
      setBusy(false);
      await loadStats();
    }
  }

  function stopAuto() {
    stopRef.current = true;
    setMsg("⏸️ Stop angefordert – laufender Batch wird noch beendet …");
  }

  const c = stats?.counts;
  const total = c?.total ?? 0;
  const withGeo = c?.withGeo ?? 0;
  const pct = total > 0 ? Math.round((withGeo / total) * 100) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Geocoding</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">→ Karte</Link>
          <Link href="/upload">→ Upload</Link>
          <Link href="/admin/dealers">→ Dubletten</Link>
        </nav>
      </div>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        „Geocode ALL“ läuft automatisch in sicheren Batches (Serverless + Rate-Limit kompatibel) und zeigt dir Fortschritt.
      </p>

      <div style={{ marginTop: 14, padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Zahlen</h3>

        {!stats ? (
          <p>Lade …</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
                <div style={{ opacity: 0.7 }}>Datensätze gesamt</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{c!.total}</div>
              </div>
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
                <div style={{ opacity: 0.7 }}>Effektive Händler (Master)</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{c!.masters}</div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>
                  (Wenn du Dubletten-Merge nutzt)
                </div>
              </div>
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
                <div style={{ opacity: 0.7 }}>Schätzung „Unique“</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{c!.approxUniqueByKey}</div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>
                  aus Name+PLZ+Ort (Sample {c!.sampleSize})
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Geo-Fortschritt: <strong>{withGeo}</strong> / {total} ({pct}%)</div>
                <div style={{ opacity: 0.75 }}>
                  missing: {c!.missingGeo} · ok: {c!.ok} · not_found: {c!.notFound} · error: {c!.error}
                </div>
              </div>

              <div style={{ height: 10, background: "#eee", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#4caf50" }} />
              </div>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer" }}>Uploads nach Quelle (source)</summary>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {Object.entries(stats.perSource)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 50)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ opacity: 0.85 }}>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
              </div>
            </details>
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {!autoRun ? (
            <button onClick={startAutoAll} disabled={busy}>
              Geocode ALL (auto)
            </button>
          ) : (
            <button onClick={stopAuto} disabled={!busy}>
              Stop
            </button>
          )}

          <button
            onClick={async () => {
              setBusy(true);
              setMsg("▶️ Ein Batch (200) …");
              try {
                const r = await runBatch(200, false);
                setMsg(`✅ Batch fertig: processed=${r.processed}, success=${r.success}, notFound=${r.notFound}, failed=${r.failed}`);
              } catch (e: any) {
                setMsg(`❌ ${e?.message ?? String(e)}`);
              } finally {
                setBusy(false);
                await loadStats();
              }
            }}
            disabled={busy}
          >
            Batch 200
          </button>

          <button
            onClick={async () => {
              setBusy(true);
              setMsg("▶️ Retry not_found (200) …");
              try {
                const r = await runBatch(200, true);
                setMsg(`✅ Retry fertig: processed=${r.processed}, success=${r.success}, notFound=${r.notFound}, failed=${r.failed}`);
              } catch (e: any) {
                setMsg(`❌ ${e?.message ?? String(e)}`);
              } finally {
                setBusy(false);
                await loadStats();
              }
            }}
            disabled={busy}
          >
            Retry not_found (200)
          </button>

          <button onClick={loadStats} disabled={busy}>
            Neu laden
          </button>
        </div>

        {msg && (
          <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
            {msg}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
        Tipp: Erst Dubletten mergen → dann geocoden. Dann geocodest du weniger doppelt und die Karte wird sauberer.
      </div>
    </main>
  );
}
